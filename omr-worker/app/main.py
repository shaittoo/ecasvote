"""
eCASVote OMR HTTP service — run: uvicorn app.main:app --host 127.0.0.1 --port 8090
"""

import base64
from typing import Any

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.ballot_omr import (
    decode_image_b64,
    debug_annotate_ballot,
    scan_ballot_image,
    warp_for_template,
)

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


@app.post("/debug-json")
def debug_json(req: ScanRequest) -> dict[str, Any]:
    """
    Same as /debug but returns JSON { image_base64, contestsDetected, contestsInTemplate,
    selectionsByPosition } so the gateway / frontend can embed the PNG inline.
    """
    try:
        img = decode_image_b64(req.image_base64)
        scan_result = scan_ballot_image(req.image_base64, req.template)
        bubble_result = scan_result.get("bubbleRead") or {}
        # Rotate to match perpendicular document feed before warping/annotation,
        # then rotate back so the returned image remains upright for UI display.
        img_ccw = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        warped, _ = warp_for_template(img_ccw, req.template)
        annotated = debug_annotate_ballot(warped, req.template, bubble_result)
        _, buf = cv2.imencode(".png", annotated)
        img_b64 = base64.b64encode(buf.tobytes()).decode()

        return {
            "image_base64": img_b64,
            "contestsDetected": bubble_result.get("contestsDetected"),
            "contestsInTemplate": bubble_result.get("contestsInTemplate"),
            "selectionsByPosition": bubble_result.get("selectionsByPosition") or {},
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/debug")
def debug(req: ScanRequest) -> HTMLResponse:
    """
    Run the full OMR pipeline and return an HTML page containing the annotated
    warped image so you can see exactly what OpenCV is detecting:
      - Red zones  : skipped header / footer bands
      - Orange     : side-margin boundaries (timing strips)
      - Cyan       : column dividers
      - Coloured rectangles : contest strips
      - Green fill : detected / picked bubble
      - Yellow ring: above threshold but not picked
      - Red ring   : below threshold
    """
    try:
        img = decode_image_b64(req.image_base64)
        scan_result = scan_ballot_image(req.image_base64, req.template)
        bubble_result = scan_result.get("bubbleRead") or {}
        img_ccw = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        warped, _ = warp_for_template(img_ccw, req.template)

        annotated = debug_annotate_ballot(warped, req.template, bubble_result)
        _, buf = cv2.imencode(".png", annotated)
        img_b64 = base64.b64encode(buf.tobytes()).decode()

        detected = bubble_result.get("contestsDetected", "?")
        in_tpl = bubble_result.get("contestsInTemplate", "?")
        selections = bubble_result.get("selectionsByPosition") or {}
        marks_html = "".join(
            f"<tr><td>{pid}</td><td>{'&nbsp;'.join(ids) if ids else '<em>—</em>'}</td></tr>"
            for pid, ids in selections.items()
        )
        html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>eCASVote OMR Debug</title>
<style>body{{font-family:monospace;background:#111;color:#eee;margin:16px}}
table{{border-collapse:collapse;margin-top:8px}}
td,th{{border:1px solid #444;padding:4px 8px}}th{{background:#222}}</style></head>
<body>
<h2>OMR Debug — warped + annotated</h2>
<p>Contests in template: <b>{in_tpl}</b> &nbsp;|&nbsp; Detected on sheet: <b>{detected}</b></p>
<img src="data:image/png;base64,{img_b64}" style="max-width:100%;border:1px solid #555">
<h3>Selections</h3>
<table><tr><th>Position</th><th>Picked option ids</th></tr>{marks_html}</table>
</body></html>"""
        return HTMLResponse(content=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
