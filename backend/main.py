import json
import logging
import shutil
import threading
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path


from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from ultralytics import YOLO

logger = logging.getLogger("ai_dataset_platform")

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "map89.pt"
UPLOAD_DIR = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"
JOBS_DIR = BASE_DIR / "jobs"
for folder in (UPLOAD_DIR, RESULTS_DIR, JOBS_DIR):
    folder.mkdir(exist_ok=True)

MODEL_ID = "local-map89"
MODEL_NAME = "Project Model"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024        # 100 MB
MAX_ZIP_FILES = 5000
MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024    # 1 GB
ALLOWED_IMAGE_SIZES = {320, 640, 1280}
DEFAULT_CONFIDENCE = 0.25
DEFAULT_IMAGE_SIZE = 640

model = None
model_lock = threading.Lock()   # only one prediction at a time
jobs_lock = threading.Lock()    # protects job JSON files


# ---------- helpers ----------

def now_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_job_id(job_id: str) -> str:
    try:
        return str(uuid.UUID(job_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found")


def job_path(job_id: str) -> Path:
    return JOBS_DIR / f"{job_id}.json"


def read_job(job_id: str) -> dict:
    job_id = parse_job_id(job_id)
    path = job_path(job_id)
    with jobs_lock:
        if not path.exists():
            raise HTTPException(status_code=404, detail="Job not found")
        return json.loads(path.read_text(encoding="utf-8"))


def write_job(job: dict) -> None:
    path = job_path(job["id"])
    tmp_path = path.with_suffix(".tmp")
    with jobs_lock:
        tmp_path.write_text(json.dumps(job, indent=2), encoding="utf-8")
        tmp_path.replace(path)


def update_job(job_id: str, **changes) -> dict:
    job = read_job(job_id)
    job.update(changes)
    write_job(job)
    return job


def list_images(folder: Path):
    return sorted(
        path
        for path in folder.rglob("*")
        if path.is_file()
        and path.suffix.lower() in IMAGE_EXTENSIONS
        and "__MACOSX" not in path.parts
    )


def remove_job_files(job_id: str) -> None:
    shutil.rmtree(UPLOAD_DIR / job_id, ignore_errors=True)
    shutil.rmtree(RESULTS_DIR / job_id, ignore_errors=True)
    (UPLOAD_DIR / f"{job_id}.zip").unlink(missing_ok=True)


def parse_options(raw: str) -> dict:
    try:
        data = json.loads(raw or "{}")
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        data = {}

    try:
        confidence = float(data.get("confidence_threshold", DEFAULT_CONFIDENCE))
    except (TypeError, ValueError):
        confidence = DEFAULT_CONFIDENCE
    confidence = min(1.0, max(0.0, confidence))

    try:
        image_size = int(data.get("image_size", DEFAULT_IMAGE_SIZE))
    except (TypeError, ValueError):
        image_size = DEFAULT_IMAGE_SIZE
    if image_size not in ALLOWED_IMAGE_SIZES:
        image_size = DEFAULT_IMAGE_SIZE

    return {"confidence_threshold": confidence, "image_size": image_size}


def safe_extract(zip_path: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    with zipfile.ZipFile(zip_path, "r") as archive:
        members = archive.infolist()
        if len(members) > MAX_ZIP_FILES:
            raise HTTPException(status_code=400, detail="ZIP contains too many files")
        if sum(member.file_size for member in members) > MAX_EXTRACTED_BYTES:
            raise HTTPException(status_code=400, detail="ZIP content is too large")
        for member in members:
            destination = (root / member.filename).resolve()
            if not destination.is_relative_to(root):
                raise HTTPException(status_code=400, detail="Invalid ZIP file structure")
        archive.extractall(root)


def mark_stale_jobs() -> None:
    """Jobs interrupted by a server restart can never finish."""
    for path in JOBS_DIR.glob("*.json"):
        try:
            job = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if job.get("status") in {"QUEUED", "PROCESSING", "PACKAGING"}:
            job["status"] = "FAILED"
            job["error_message"] = "The server restarted before this job finished."
            write_job(job)


# ---------- inference worker ----------

def run_inference_job(job_id: str) -> None:
    try:
        job = read_job(job_id)
        options = job["options"]
        update_job(job_id, status="PROCESSING", progress=5, error_message=None)

        image_dir = UPLOAD_DIR / job_id
        images = list_images(image_dir)
        if not images:
            raise ValueError("No images found")

        out_dir = RESULTS_DIR / job_id
        shutil.rmtree(out_dir, ignore_errors=True)
        annotated_dir = out_dir / "annotated_images"
        annotated_dir.mkdir(parents=True)

        results = []
        class_counts = {}
        failed_images = 0
        total = len(images)
        step = max(1, total // 50)

        for index, image_path in enumerate(images, start=1):
            relative_name = image_path.relative_to(image_dir).as_posix()
            try:
                with model_lock:
                    prediction = model.predict(
                        source=str(image_path),
                        conf=options["confidence_threshold"],
                        imgsz=options["image_size"],
                        verbose=False,
                    )[0]
                    prediction.save(
                        filename=str(annotated_dir / f"{index:05d}_{image_path.name}")
                    )

                detections = []
                if prediction.boxes is not None:
                    for box in prediction.boxes:
                        class_id = int(box.cls[0])
                        class_name = model.names[class_id]
                        class_counts[class_name] = class_counts.get(class_name, 0) + 1
                        detections.append({
                            "class_id": class_id,
                            "class_name": class_name,
                            "confidence": round(float(box.conf[0]), 4),
                            "box": [round(float(v), 2) for v in box.xyxy[0].tolist()],
                        })
                results.append({"image": relative_name, "detections": detections})
            except Exception:
                logger.exception("Could not process %s", relative_name)
                failed_images += 1
                results.append({
                    "image": relative_name,
                    "detections": [],
                    "error": "Could not process image",
                })

            if index % step == 0 or index == total:
                update_job(job_id, progress=5 + int(85 * index / total))

        update_job(job_id, status="PACKAGING", progress=92)

        summary = {
            "job_id": job_id,
            "model": MODEL_NAME,
            "options": options,
            "total_images": total,
            "processed_images": total - failed_images,
            "failed_images": failed_images,
            "images_with_detections": sum(1 for r in results if r["detections"]),
            "total_detections": sum(len(r["detections"]) for r in results),
            "class_counts": dict(sorted(class_counts.items(), key=lambda x: -x[1])),
        }

        predictions_path = out_dir / "predictions.json"
        summary_path = out_dir / "summary.json"
        manifest_path = out_dir / "manifest.json"
        predictions_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

        annotated_files = sorted(annotated_dir.iterdir())
        manifest = {
            "job_id": job_id,
            "model_id": MODEL_ID,
            "created_at": job["created_at"],
            "generated_at": now_iso(),
            "files": [
                "results/predictions.json",
                "report/summary.json",
                *[f"results/annotated_images/{f.name}" for f in annotated_files],
            ],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        with zipfile.ZipFile(out_dir / "result.zip", "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(predictions_path, "results/predictions.json")
            archive.write(summary_path, "report/summary.json")
            archive.write(manifest_path, "manifest.json")
            for file in annotated_files:
                archive.write(file, f"results/annotated_images/{file.name}")

        update_job(
            job_id,
            status="COMPLETED",
            progress=100,
            completed_at=now_iso(),
            summary=summary,
        )
    except Exception:
        logger.exception("Job %s failed", job_id)
        try:
            update_job(job_id, status="FAILED", error_message="Inference failed.")
        except Exception:
            logger.exception("Could not mark job %s as failed", job_id)


# ---------- app ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    if MODEL_PATH.exists():
        model = YOLO(str(MODEL_PATH))
    else:
        logger.error("Model file not found: %s", MODEL_PATH)
    mark_stale_jobs()
    yield


app = FastAPI(title="AI Dataset Platform API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "AI Dataset Platform Backend Running"}


@app.get("/api/health")
def health():
    return {"status": "online", "model_loaded": model is not None}


@app.get("/api/models")
def get_models():
    return {
        "models": [
            {
                "id": MODEL_ID,
                "name": MODEL_NAME,
                "type": "LOCAL",
                "task": model.task if model else None,
                "classes": model.names if model else {},
                "available": model is not None,
            }
        ]
    }


@app.post("/api/upload")
def upload_dataset(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are allowed")

    job_id = str(uuid.uuid4())
    zip_path = UPLOAD_DIR / f"{job_id}.zip"
    extract_path = UPLOAD_DIR / job_id

    try:
        size = 0
        with zip_path.open("wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File too large")
                buffer.write(chunk)

        safe_extract(zip_path, extract_path)
        images = list_images(extract_path)
        if not images:
            raise HTTPException(status_code=400, detail="No images found in the ZIP")
    except zipfile.BadZipFile:
        remove_job_files(job_id)
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    except Exception:
        remove_job_files(job_id)
        raise
    finally:
        file.file.close()

    zip_path.unlink(missing_ok=True)  # extracted folder is enough

    job = {
        "id": job_id,
        "model_id": None,
        "model_name": None,
        "status": "UPLOADED",
        "progress": 0,
        "created_at": now_iso(),
        "completed_at": None,
        "error_message": None,
        "file_name": file.filename,
        "options": {},
        "total_images": len(images),
        "summary": None,
    }
    write_job(job)

    return {
        "job_id": job_id,
        "status": "UPLOADED",
        "message": "ZIP uploaded successfully",
        "total_images": len(images),
    }
class StartJobRequest(BaseModel):
    model_id: str = MODEL_ID
    options: dict = Field(default_factory=dict)


start_lock = threading.Lock()


@app.post("/api/jobs/{job_id}/start")
def start_job(job_id: str, payload: StartJobRequest, background_tasks: BackgroundTasks):
    if payload.model_id != MODEL_ID:
        raise HTTPException(status_code=400, detail="Unknown model")
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    with start_lock:
        job = read_job(job_id)
        if job["status"] != "UPLOADED":
            raise HTTPException(status_code=409, detail="Job was already started")
        job = update_job(
            job["id"],
            model_id=MODEL_ID,
            model_name=MODEL_NAME,
            status="QUEUED",
            progress=5,
            options=parse_options(json.dumps(payload.options)),
        )

    background_tasks.add_task(run_inference_job, job["id"])
    return job

@app.get("/api/jobs")
def list_jobs():
    jobs = []
    for path in JOBS_DIR.glob("*.json"):
        try:
            with jobs_lock:
                jobs.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    jobs.sort(key=lambda job: job.get("created_at", ""), reverse=True)
    return jobs


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    return read_job(job_id)


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str):
    job = read_job(job_id)
    if job["status"] in {"PROCESSING", "PACKAGING"}:
        raise HTTPException(status_code=409, detail="Job is still running")
    remove_job_files(job["id"])
    job_path(job["id"]).unlink(missing_ok=True)


@app.get("/api/jobs/{job_id}/predictions")
def get_predictions(job_id: str):
    job = read_job(job_id)
    path = RESULTS_DIR / job["id"] / "predictions.json"
    if job["status"] != "COMPLETED" or not path.exists():
        raise HTTPException(status_code=409, detail="Results are not ready")
    return FileResponse(path, media_type="application/json")


@app.get("/api/jobs/{job_id}/result")
def download_result(job_id: str):
    job = read_job(job_id)
    path = RESULTS_DIR / job["id"] / "result.zip"
    if job["status"] != "COMPLETED" or not path.exists():
        raise HTTPException(status_code=409, detail="Results are not ready")
    return FileResponse(
        path, media_type="application/zip", filename=f"job-{job['id']}-result.zip"
    )