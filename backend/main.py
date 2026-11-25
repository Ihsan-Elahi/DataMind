import json
import logging
import os
import re
import secrets
import shutil
import sqlite3
import threading
import uuid
import zipfile
from contextlib import asynccontextmanager, closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
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

# ---------- auth helpers ----------

DB_PATH = BASE_DIR / "users.db"
SECRET_FILE = BASE_DIR / "jwt_secret.key"
TOKEN_HOURS = 24
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt())


def load_secret() -> str:
    env_secret = os.getenv("JWT_SECRET")
    if env_secret:
        return env_secret
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text(encoding="utf-8").strip()
    value = secrets.token_hex(32)
    SECRET_FILE.write_text(value, encoding="utf-8")
    return value


JWT_SECRET = load_secret()


def db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(db_connect()) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        conn.commit()


def db_query_one(sql, params=()):
    with closing(db_connect()) as conn:
        return conn.execute(sql, params).fetchone()


def db_execute(sql, params=()):
    with closing(db_connect()) as conn:
        conn.execute(sql, params)
        conn.commit()


def make_session(user: dict) -> dict:
    payload = {
        "sub": user["id"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
    }


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    row = db_query_one(
        "SELECT id, email, name FROM users WHERE id = ?", (payload.get("sub"),)
    )
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return dict(row)


def get_owned_job(job_id: str, user: dict) -> dict:
    job = read_job(job_id)
    if job.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

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
    init_db()
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


# ---------- auth endpoints ----------

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/auth/register", status_code=201)
def register(payload: RegisterRequest):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password_bytes = payload.password.encode("utf-8")

    if not name or len(name) > 80:
        raise HTTPException(status_code=400, detail="Enter your name")
    if len(email) > 254 or not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters"
        )
    if len(password_bytes) > 72:
        raise HTTPException(status_code=400, detail="Password is too long")

    user = {"id": str(uuid.uuid4()), "email": email, "name": name}
    password_hash = bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")
    try:
        db_execute(
            "INSERT INTO users (id, email, name, password_hash, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (user["id"], email, name, password_hash, now_iso()),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        )
    return make_session(user)


@app.post("/api/auth/login")
def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    password_bytes = payload.password.encode("utf-8")
    row = db_query_one(
        "SELECT id, email, name, password_hash FROM users WHERE email = ?", (email,)
    )
    stored_hash = row["password_hash"].encode("utf-8") if row else DUMMY_HASH

    password_ok = len(password_bytes) <= 72 and bcrypt.checkpw(
        password_bytes, stored_hash
    )
    if row is None or not password_ok:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return make_session(dict(row))


# ---------- datasets and jobs (login required) ----------

@app.post("/api/upload")
def upload_dataset(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
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

    zip_path.unlink(missing_ok=True)

    job = {
        "id": job_id,
        "owner_id": user["id"],
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
def start_job(
    job_id: str,
    payload: StartJobRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    if payload.model_id != MODEL_ID:
        raise HTTPException(status_code=400, detail="Unknown model")
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    with start_lock:
        job = get_owned_job(job_id, user)
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
def list_jobs(user: dict = Depends(get_current_user)):
    jobs = []
    for path in JOBS_DIR.glob("*.json"):
        try:
            with jobs_lock:
                job = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if job.get("owner_id") == user["id"]:
            jobs.append(job)
    jobs.sort(key=lambda job: job.get("created_at", ""), reverse=True)
    return jobs


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, user: dict = Depends(get_current_user)):
    return get_owned_job(job_id, user)


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str, user: dict = Depends(get_current_user)):
    job = get_owned_job(job_id, user)
    if job["status"] in {"QUEUED", "PROCESSING", "PACKAGING"}:
        raise HTTPException(status_code=409, detail="Job is still running")
    remove_job_files(job["id"])
    job_path(job["id"]).unlink(missing_ok=True)


@app.get("/api/jobs/{job_id}/predictions")
def get_predictions(job_id: str, user: dict = Depends(get_current_user)):
    job = get_owned_job(job_id, user)
    path = RESULTS_DIR / job["id"] / "predictions.json"
    if job["status"] != "COMPLETED" or not path.exists():
        raise HTTPException(status_code=409, detail="Results are not ready")
    return FileResponse(path, media_type="application/json")


@app.get("/api/jobs/{job_id}/result")
def download_result(job_id: str, user: dict = Depends(get_current_user)):
    job = get_owned_job(job_id, user)
    path = RESULTS_DIR / job["id"] / "result.zip"
    if job["status"] != "COMPLETED" or not path.exists():
        raise HTTPException(status_code=409, detail="Results are not ready")
    return FileResponse(
        path, media_type="application/zip", filename=f"job-{job['id']}-result.zip"
    )