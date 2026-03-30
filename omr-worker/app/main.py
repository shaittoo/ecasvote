"""
eCASVote OMR HTTP service — run: uvicorn app.main:app --host 127.0.0.1 --port 8090
"""

from typing import Any

import base64
import os

import cv2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.ballot_omr import scan_ballot_image

app = FastAPI(title="eCASVote OMR Worker", version="1.0.0")


class ScanRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image (PNG/JPEG)")
    template: dict[str, Any] = Field(
        ..., description="ecasvote-scanner-template/1 JSON from admin export"
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ecasvote-omr-worker"}


@app.post("/scan")
def scan(req: ScanRequest) -> dict[str, Any]:
    try:
        return scan_ballot_image(req.image_base64, req.template)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/capture-device")
def capture_device() -> dict[str, Any]:
    """
    Capture one image frame from a V4L2 camera device (e.g., NETUM camera-mode scanner).
    Env:
      - OMR_CAMERA_INDEX (default: 0)
    """
    cam_index = int(os.getenv("OMR_CAMERA_INDEX", "0"))
    cap = cv2.VideoCapture(cam_index)
    if not cap.isOpened():
        raise HTTPException(
            status_code=404,
            detail=f"CAMERA_NOT_FOUND: unable to open /dev/video{cam_index}",
        )
    try:
        frame = None
        # Warm-up reads help USB cameras settle exposure/focus.
        for _ in range(6):
            ok, img = cap.read()
            if ok:
                frame = img
        if frame is None:
            raise HTTPException(status_code=500, detail="CAMERA_CAPTURE_FAILED")
        ok, encoded = cv2.imencode(".png", frame)
        if not ok:
            raise HTTPException(status_code=500, detail="PNG_ENCODE_FAILED")
        image_b64 = base64.b64encode(encoded.tobytes()).decode("ascii")
        return {
            "ok": True,
            "source": "camera",
            "fileName": f"scanner-{cam_index}.png",
            "mimeType": "image/png",
            "imageBase64": image_b64,
            "cameraIndex": cam_index,
        }
    finally:
        cap.release()
