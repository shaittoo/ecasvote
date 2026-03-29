"""
eCASVote OMR HTTP service — run: uvicorn app.main:app --host 127.0.0.1 --port 8090

Environment variables:
  GATEWAY_URL   URL of the eCASVote gateway (e.g. http://127.0.0.1:3000).
                When set, the worker fetches bubble layout from /api/omr-layout/:ballotId
                instead of reading it from the QR payload or the template object.
"""

import base64
import os
from typing import Any

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.ballot_omr import (
    _debug_annotate_v2,
    _fetch_ballot_layout,
    _scan_ballot_image_v2,
    compute_homography,
    debug_annotate_ballot,
    decode_image_b64,
    detect_corner_fiducials,
    scan_ballot_image,
)
from app.omr_layout_v1 import reproduce_warped_after_rotation

app = FastAPI(title="eCASVote OMR Worker", version="2.0.0")


class ScanRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image (PNG/JPEG)")
    # template is optional — worker fetches layout from /api/omr-layout using ballotId in QR.
    # Still accepted for backward compat with older gateway versions.
    template: dict[str, Any] | None = Field(
        default=None,
        description="(Optional) ecasvote-scanner-template/1 JSON — used as fallback when GATEWAY_URL is not set",
    )


def _gateway_url() -> str:
    return os.getenv("GATEWAY_URL", "").rstrip("/")


@app.get("/health")
def health() -> dict[str, str]:
    gw = _gateway_url()
    return {
        "status": "ok",
        "service": "ecasvote-omr-worker",
        "pipeline": "layout-v2-gateway" if gw else "layout-v1-template",
        "gateway_url": gw or "(not set)",
    }


@app.post("/scan")
def scan(req: ScanRequest) -> dict[str, Any]:
    """
    Full OMR scan.  When GATEWAY_URL is configured:
      1. Decode image
      2. Find rotation via QR corner position
      3. Warp once with corner fiducials
      4. Decode QR → extract ballotId + layoutHash
      5. GET {GATEWAY_URL}/api/omr-layout/{ballotId}
      6. Verify layoutHash
      7. Score bubbles (Otsu, position-based, ±7 px tolerance)
      8. Return { ballotId, electionId, templateId, selections, confidence, … }

    Falls back to the legacy template-based pipeline if GATEWAY_URL is unset or the
    new pipeline cannot locate the QR / layout.
    """
    try:
        return scan_ballot_image(req.image_base64, req.template)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/debug-json")
def debug_json(req: ScanRequest) -> dict[str, Any]:
    print("ENTERED debug_json")
    """
    Returns annotated ballot image (base64 PNG) + selections for inline display.
    Uses the same rotation and warp as the final scan result.
    Draws: fiducial corners, expected bubble centers, filled/blank bubbles.
    """
    try:
        img = decode_image_b64(req.image_base64)
        scan_result = scan_ballot_image(req.image_base64, req.template)

        gw = _gateway_url()
        annotated: Any = None

        # Try v2 path: fetch layout and use v2 annotator
        if gw and scan_result.get("ok") and scan_result.get("ballotId"):
            ballot_id = str(scan_result["ballotId"])
            layout_record = _fetch_ballot_layout(ballot_id, gw)
            if layout_record and isinstance(layout_record.get("layout"), dict):
                from app.omr_layout_v1 import apply_corner_fiducial_warp_only, rotate_input
                rot_deg = int(
                    (scan_result.get("bubbleRead") or {})
                    .get("warpDebug", {})
                    .get("inputRotationDeg", 0)
                )
                rotated = rotate_input(img, rot_deg)
                warped, _ = apply_corner_fiducial_warp_only(
                    rotated, detect_corner_fiducials, compute_homography
                )
                if warped is not None:
                    annotated = _debug_annotate_v2(
                        warped, layout_record["layout"], scan_result
                    )

        # Fallback to legacy annotator
        if annotated is None:
            bubble_result = scan_result.get("bubbleRead") or {}
            warp_dbg = bubble_result.get("warpDebug") or {}
            rot_deg = int(warp_dbg.get("inputRotationDeg", 0))
            warped_fb, _ = reproduce_warped_after_rotation(
                img, rot_deg, detect_corner_fiducials, compute_homography
            )
            src = warped_fb if warped_fb is not None else img
            print("ABOUT TO CALL debug_annotate_ballot")
            annotated = debug_annotate_ballot(src, req.template or {}, bubble_result)

        _, buf = cv2.imencode(".png", annotated)
        img_b64 = base64.b64encode(buf.tobytes()).decode()

        bubble_result = scan_result.get("bubbleRead") or {}
        return {
            "image_base64": img_b64,
            "contestsDetected": bubble_result.get("contestsDetected"),
            "contestsInTemplate": bubble_result.get("contestsInTemplate"),
            "selectionsByPosition": scan_result.get("selectionsByPosition") or {},
            "selections": scan_result.get("selections") or {},
            "ballotId": scan_result.get("ballotId"),
            "electionId": scan_result.get("electionId"),
            "confidence": scan_result.get("confidence"),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/debug")
def debug(req: ScanRequest) -> HTMLResponse:
    """
    Run the full OMR pipeline and return an HTML page with the annotated warped image.
    """
    try:
        img = decode_image_b64(req.image_base64)
        scan_result = scan_ballot_image(req.image_base64, req.template)

        gw = _gateway_url()
        annotated: Any = None
        layout_for_display: dict[str, Any] | None = None

        if gw and scan_result.get("ok") and scan_result.get("ballotId"):
            ballot_id = str(scan_result["ballotId"])
            layout_record = _fetch_ballot_layout(ballot_id, gw)
            if layout_record and isinstance(layout_record.get("layout"), dict):
                layout_for_display = layout_record["layout"]
                from app.omr_layout_v1 import apply_corner_fiducial_warp_only, rotate_input
                rot_deg = int(
                    (scan_result.get("bubbleRead") or {})
                    .get("warpDebug", {})
                    .get("inputRotationDeg", 0)
                )
                warped, _ = apply_corner_fiducial_warp_only(
                    rotate_input(img, rot_deg), detect_corner_fiducials, compute_homography
                )
                if warped is not None:
                    annotated = _debug_annotate_v2(warped, layout_for_display, scan_result)

        if annotated is None:
            bubble_result = scan_result.get("bubbleRead") or {}
            rot_deg = int((bubble_result.get("warpDebug") or {}).get("inputRotationDeg", 0))
            warped_fb, _ = reproduce_warped_after_rotation(
                img, rot_deg, detect_corner_fiducials, compute_homography
            )
            src = warped_fb if warped_fb is not None else img
            annotated = debug_annotate_ballot(src, req.template or {}, bubble_result)

        _, buf = cv2.imencode(".png", annotated)
        img_b64 = base64.b64encode(buf.tobytes()).decode()

        selections = scan_result.get("selectionsByPosition") or {}
        bubble_result = scan_result.get("bubbleRead") or {}
        detected = bubble_result.get("contestsDetected", len(selections))
        in_tpl = bubble_result.get("contestsInTemplate", "?")
        ballot_id_disp = scan_result.get("ballotId") or "—"
        confidence_disp = f"{scan_result.get('confidence', 0):.2f}"

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
<p>Ballot ID: <b>{ballot_id_disp}</b> &nbsp;|&nbsp; Contests in template: <b>{in_tpl}</b>
 &nbsp;|&nbsp; Detected: <b>{detected}</b> &nbsp;|&nbsp; Confidence: <b>{confidence_disp}</b></p>
<img src="data:image/png;base64,{img_b64}" style="max-width:100%;border:1px solid #555">
<h3>Selections</h3>
<table><tr><th>Position</th><th>Picked option ids</th></tr>{marks_html}</table>
</body></html>"""
        return HTMLResponse(content=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
