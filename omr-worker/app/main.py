"""
eCASVote OMR HTTP service — run: uvicorn app.main:app --host 127.0.0.1 --port 8090
"""

from typing import Any

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
