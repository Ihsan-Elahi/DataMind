
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from pathlib import Path
import zipfile
import shutil
import uuid

from fastapi import UploadFile, File, HTTPException

app = FastAPI(title="AI Dataset Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "map89.pt"
UPLOAD_DIR = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"

UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

model = None

@app.post("/api/jobs/{job_id}/inference")
def run_inference(job_id: str):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    image_dir = UPLOAD_DIR / job_id

    if not image_dir.exists():
        raise HTTPException(status_code=404, detail="Dataset not found")

    images = [
        path for path in image_dir.rglob("*")
        if path.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
    ]

    if not images:
        raise HTTPException(status_code=400, detail="No images found")

    results = []

    for image_path in images:
        predictions = model.predict(
            source=str(image_path),
            conf=0.25,
            verbose=False
        )

        for prediction in predictions:
            detections = []

            for box in prediction.boxes:
                class_id = int(box.cls[0])
                detections.append({
                    "class_id": class_id,
                    "class_name": model.names[class_id],
                    "confidence": round(float(box.conf[0]), 4),
                    "box": [
                        round(float(value), 2)
                        for value in box.xyxy[0].tolist()
                    ]
                })

            results.append({
                "image": image_path.name,
                "detections": detections
            })

    return {
        "job_id": job_id,
        "status": "completed",
        "model": "map89.pt",
        "total_images": len(images),
        "results": results
    }


@app.on_event("startup")
def load_model():
    global model
    model = YOLO(str(MODEL_PATH))

@app.get("/")
def home():
    return {"message": "AI Dataset Platform Backend Running"}

@app.get("/api/health")
def health():
    return {
        "status": "online",
        "model_loaded": model is not None
    }

@app.get("/api/models")
def get_models():
    return {
        "models": [
            {
                "id": "local-map89",
                "name": "Project Model",
                "type": "LOCAL",
                "task": model.task if model else None,
                "classes": model.names if model else {},
                "available": model is not None
            }
        ]
    }

@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="Only ZIP files are allowed"
        )

    job_id = str(uuid.uuid4())
    zip_path = UPLOAD_DIR / f"{job_id}.zip"
    extract_path = UPLOAD_DIR / job_id

    try:
        with zip_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        with zipfile.ZipFile(zip_path, "r") as archive:
            for item in archive.infolist():
                target = (extract_path / item.filename).resolve()

                if not target.is_relative_to(extract_path.resolve()):
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid ZIP file structure"
                    )

            archive.extractall(extract_path)

        images = [
            str(path)
            for path in extract_path.rglob("*")
            if path.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
        ]

        return {
            "job_id": job_id,
            "message": "ZIP uploaded successfully",
            "total_images": len(images),
            "images": images
        }

    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=400,
            detail="Invalid ZIP file"
        )

    finally:
        await file.close()
