"""
eCASVote OMR HTTP service — run: uvicorn app.main:app --host 127.0.0.1 --port 8090

Environment variables:
  GATEWAY_URL          URL of the eCASVote gateway (e.g. http://127.0.0.1:3000).
                       When set, the worker fetches bubble layout from /api/omr-layout/:ballotId
                       instead of reading it from the QR payload or the template object.
  OMR_FIDUCIAL_WARP    Default ``crop``: bbox from corner fiducials (or grid corners), crop,
                       resize to canonical — no perspective distortion. Set ``homography`` for
                       full ``warpPerspective`` from the 8-point fiducial grid. ``1``/``true``/``on``
                       are aliases for ``crop``. Set ``0``/``false``/``off`` for resize-only (debug).
  OMR_COARSE_DOCUMENT_WARP Default ``1``. Bright-sheet quad dewarp before fiducials (live camera).
                       Set ``0`` to disable.
  OMR_AUTO_HOMOGRAPHY_SKEW_DEG Default ``2.25``. In crop mode, auto-use homography when corner quad
                       is skewed; set ``0`` to disable.
  OMR_POST_WARP_DESKEW Default ``0``. After **homography** warp only, set ``1`` for an extra Hough
                       deskew (can shift bubble geometry; ignored for bbox crop).
  OMR_BBOX_SPAN_Y_BIAS_PX Default ``2``. Bbox-crop mode only: subtract from template-mapped Y
                       (shift expected centers up). Use ``0`` to disable.
  OMR_BBOX_CROP_BOTTOM_TRIM_FRAC Default ``0``. Fraction of bbox height trimmed from crop bottom;
                       legacy ``0.1`` cut off bottom corner fiducials / QR on camera scans.
  OMR_BBOX_EXTRA_EDGE_PAD_PX Default ``8``. Extra padding (px) outside corner-centroid bbox on each side.
  OMR_BBOX_RIGHT_COL_X_NUDGE_PX Default ``0``. When template nx ≥ OMR_BBOX_RIGHT_COL_NX_MIN,
                       subtract this from mapped X (shift expected blue dot **left**, e.g. column 3).
  OMR_BBOX_RIGHT_COL_NX_MIN Default ``0.62``. Template-normalized X (0–1) threshold for that nudge.
  OMR_BUBBLE_CLAHE    Default ``1``: apply CLAHE on BT.601 luminance before bubble ROI stats.
                       Set to ``0``/``false``/``off`` to disable (compare stability on tinted scans).
  OMR_BUBBLE_MASK_PAD_SCALE Default ``1``. Multiplier for the per-bubble margin when building the
                       scoring mask (smaller ⇒ smaller bright “unmasked” patches in the debug tint).
                       Clamped to ``0.5``–``1.25``; values below ``1`` also tighten real scoring mask.
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
    compute_homography,
    debug_annotate_ballot,
    decode_image_b64,
    detect_corner_fiducials,
    scan_ballot_image,
    scan_ballot_image_with_warp,
)
from app.omr_layout_v1 import (
    CANONICAL_H,
    CANONICAL_W,
    annotate_warped_layout,
    merge_layout_geometry_for_mapping,
    reproduce_warped_after_rotation,
    rotate_input,
)

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


def _extract_ballot_id(scan_result: dict[str, Any]) -> str:
    bid = str(scan_result.get("ballotId") or "").strip()
    if bid:
        return bid
    qr = scan_result.get("qr")
    if isinstance(qr, dict):
        t = str(qr.get("ballotToken") or qr.get("ballotId") or "").strip()
        if t:
            return t
    return ""


def _warped_for_debug_overlay(
    img: Any,
    scan_result: dict[str, Any],
    warped_v2: Any | None,
    template: dict[str, Any] | None = None,
) -> Any | None:
    if warped_v2 is not None:
        return warped_v2
    br = scan_result.get("bubbleRead") or {}
    wd = br.get("warpDebug") or {}
    rot_deg = int(wd.get("inputRotationDeg", 0))
    warped_fb, _ = reproduce_warped_after_rotation(
        img, rot_deg, detect_corner_fiducials, compute_homography, template
    )
    return warped_fb


def _synthesize_canonical_warp_for_debug(img: Any, scan_result: dict[str, Any]) -> Any | None:
    """Same canonical size as scoring when warped_v2 is missing: rotate + resize (no extra warp)."""
    if img is None or not hasattr(img, "shape") or getattr(img, "size", 0) == 0:
        return None
    br = scan_result.get("bubbleRead") or {}
    wd = br.get("warpDebug") or {}
    rot_deg = int(wd.get("inputRotationDeg", 0))
    rotated = rotate_input(img, rot_deg)
    h0, w0 = rotated.shape[:2]
    interp = (
        cv2.INTER_AREA
        if (w0 > CANONICAL_W or h0 > CANONICAL_H)
        else cv2.INTER_CUBIC
    )
    return cv2.resize(rotated, (CANONICAL_W, CANONICAL_H), interpolation=interp)


def _try_geometry_debug_overlay(
    *,
    img: Any,
    template: dict[str, Any] | None,
    scan_result: dict[str, Any],
    warped_v2: Any | None,
) -> Any | None:
    """Gateway-stored layout first; then client template.geometry; then layoutDebug rows."""
    tpl = template or {}
    geom = tpl.get("geometry") if isinstance(tpl.get("geometry"), dict) else None
    br = scan_result.get("bubbleRead") or {}
    layout_dbg = br.get("layoutDebug")
    ballot_id = _extract_ballot_id(scan_result)
    gw = _gateway_url()

    warped = _warped_for_debug_overlay(img, scan_result, warped_v2, tpl)
    if warped is None:
        warped = _synthesize_canonical_warp_for_debug(img, scan_result)

    sel_raw = scan_result.get("selectionsByPosition") or br.get("selectionsByPosition") or {}
    sel: dict[str, list[str]] = {}
    for k, v in sel_raw.items():
        if isinstance(v, list):
            sel[str(k)] = [str(x) for x in v]
        elif v is not None:
            sel[str(k)] = [str(v)]

    layout_record: dict[str, Any] | None = None
    gateway_layout: dict[str, Any] | None = None
    if gw and ballot_id:
        layout_record = _fetch_ballot_layout(ballot_id, gw)
        if layout_record and isinstance(layout_record.get("layout"), dict):
            gateway_layout = layout_record["layout"]  # type: ignore[assignment]
        acct = str(layout_record.get("academicOrg") or "").strip() if layout_record else ""
        if acct:
            print("OVERLAY BALLOT academicOrg:", acct)

    if gateway_layout is not None:
        if warped is None:
            warped = _synthesize_canonical_warp_for_debug(img, scan_result)
        if warped is not None:
            print("OVERLAY: geometry-based (gateway layout)")
            layout_draw = merge_layout_geometry_for_mapping(gateway_layout, tpl)
            return _debug_annotate_v2(warped, layout_draw, scan_result)
        print("OVERLAY: gateway layout present but no warped canvas")

    print(
        "HAS layoutDebug:",
        isinstance(layout_dbg, list),
        "len=",
        len(layout_dbg) if isinstance(layout_dbg, list) else None,
    )

    if isinstance(geom, dict) and geom.get("contests") and warped is not None:
        print("OVERLAY: geometry-based (client template)")
        return _debug_annotate_v2(warped, geom, scan_result)

    if isinstance(layout_dbg, list) and len(layout_dbg) > 0 and warped is not None:
        print("OVERLAY: geometry-based (layoutDebug rows)")
        return annotate_warped_layout(warped, layout_dbg, sel)

    return None


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
    """
    Returns annotated ballot image (base64 PNG) + selections for inline display.
    Uses the same rotation and warp as the final scan result.
    Draws: fiducial corners, expected bubble centers, filled/blank bubbles.
    """
    try:
        img = decode_image_b64(req.image_base64)
        scan_result, warped_v2 = scan_ballot_image_with_warp(
            req.image_base64, req.template
        )

        # TEMPORARY DEBUG — dump all bubble scores
        _br_dbg = scan_result.get("bubbleRead") or {}
        _ov_dbg = _br_dbg.get("bubbleOverlay") or _br_dbg.get("contestsRead") or []
        if not _ov_dbg:
            # Try deeper nesting
            print(f"DEBUG-JSON: bubbleRead keys={list(_br_dbg.keys())[:15]}")
            # Check contestsRead for per-bubble data
            _cr = _br_dbg.get("contestsRead") or []
            if _cr:
                print(f"DEBUG-JSON: contestsRead has {len(_cr)} contests")
            # Dump raw scores
            _rs = scan_result.get("rawBubbleScores") or _br_dbg.get("rawBubbleScores") or {}
            for _pid, _scores in _rs.items():
                for _oid, _sv in _scores.items():
                    if not str(_oid).startswith("_"):
                        print(f"SCORE {str(_pid)[:20]:20s} {str(_oid)[:25]:25s} score={float(_sv):.3f}")
        else:
            for _ov in _ov_dbg:
                print(f"BUBBLE {str(_ov.get('positionId',''))[:20]:20s} {str(_ov.get('optionId',''))[:25]:25s} idr={float(_ov.get('innerDarkRatio',0)):.3f} cc={float(_ov.get('innerCcRatio',0)):.3f} cmd={float(_ov.get('coreMeanDark',0)):.3f} sc={float(_ov.get('score',0)):.3f} cls={str(_ov.get('fillClassification',''))}")

        annotated = _try_geometry_debug_overlay(
            img=img,
            template=req.template,
            scan_result=scan_result,
            warped_v2=warped_v2,
        )

        if annotated is None:
            gw_ov = _gateway_url()
            bid_ov = _extract_ballot_id(scan_result)
            if gw_ov and bid_ov:
                print(
                    "OVERLAY: legacy fallback suppressed (GATEWAY_URL + ballotId — "
                    "fix GET /api/omr-layout or scan pipeline)"
                )
                annotated = img.copy()
                cv2.putText(
                    annotated,
                    "No geometry overlay (gateway layout missing or unwarp failed)",
                    (12, 36),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (0, 0, 255),
                    2,
                    cv2.LINE_AA,
                )
            else:
                print("OVERLAY: legacy fallback")
                bubble_result = scan_result.get("bubbleRead") or {}
                # TEMPORARY DEBUG
                for _ov in (bubble_result.get("bubbleOverlay") or []):
                    _pid = str(_ov.get("positionId",""))[:20]
                    _oid = str(_ov.get("optionId",""))[:25]
                    _idr = float(_ov.get("innerDarkRatio", 0))
                    _ccr = float(_ov.get("innerCcRatio", 0))
                    _cmd = float(_ov.get("coreMeanDark", 0))
                    _sc = float(_ov.get("score", 0))
                    _cls = str(_ov.get("fillClassification", ""))
                    print(f"BUBBLE {_pid:20s} {_oid:25s} idr={_idr:.3f} cc={_ccr:.3f} cmd={_cmd:.3f} sc={_sc:.3f} cls={_cls}")
                warp_dbg = bubble_result.get("warpDebug") or {}
                rot_deg = int(warp_dbg.get("inputRotationDeg", 0))
                warped_fb, _ = reproduce_warped_after_rotation(
                    img,
                    rot_deg,
                    detect_corner_fiducials,
                    compute_homography,
                    req.template,
                )
                src = warped_fb if warped_fb is not None else img
                annotated = debug_annotate_ballot(src, req.template or {}, bubble_result)

        _, buf = cv2.imencode(".png", annotated)
        img_b64 = base64.b64encode(buf.tobytes()).decode()

        bubble_result = scan_result.get("bubbleRead") or {}
        # TEMPORARY DEBUG — print bubble scores
        for _ov in (bubble_result.get("bubbleOverlay") or []):
            _pid = str(_ov.get('positionId',''))[:20]
            _oid = str(_ov.get('optionId',''))[:25]
            _idr = float(_ov.get('innerDarkRatio', 0))
            _ccr = float(_ov.get('innerCcRatio', 0))
            _cmd = float(_ov.get('coreMeanDark', 0))
            _sc = float(_ov.get('score', 0))
            _cls = str(_ov.get('fillClassification', ''))
            print(f"BUBBLE {_pid:20s} {_oid:25s} idr={_idr:.3f} cc={_ccr:.3f} cmd={_cmd:.3f} sc={_sc:.3f} cls={_cls}")
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
        scan_result, warped_v2 = scan_ballot_image_with_warp(
            req.image_base64, req.template
        )

        annotated = _try_geometry_debug_overlay(
            img=img,
            template=req.template,
            scan_result=scan_result,
            warped_v2=warped_v2,
        )

        if annotated is None:
            gw_ov = _gateway_url()
            bid_ov = _extract_ballot_id(scan_result)
            if gw_ov and bid_ov:
                print(
                    "OVERLAY: legacy fallback suppressed (GATEWAY_URL + ballotId — "
                    "fix GET /api/omr-layout or scan pipeline)"
                )
                annotated = img.copy()
                cv2.putText(
                    annotated,
                    "No geometry overlay (gateway layout missing or unwarp failed)",
                    (12, 36),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (0, 0, 255),
                    2,
                    cv2.LINE_AA,
                )
            else:
                print("OVERLAY: legacy fallback")
                bubble_result = scan_result.get("bubbleRead") or {}
                # TEMPORARY DEBUG
                for _ov in (bubble_result.get("bubbleOverlay") or []):
                    _pid = str(_ov.get("positionId",""))[:20]
                    _oid = str(_ov.get("optionId",""))[:25]
                    _idr = float(_ov.get("innerDarkRatio", 0))
                    _ccr = float(_ov.get("innerCcRatio", 0))
                    _cmd = float(_ov.get("coreMeanDark", 0))
                    _sc = float(_ov.get("score", 0))
                    _cls = str(_ov.get("fillClassification", ""))
                    print(f"BUBBLE {_pid:20s} {_oid:25s} idr={_idr:.3f} cc={_ccr:.3f} cmd={_cmd:.3f} sc={_sc:.3f} cls={_cls}")
                rot_deg = int((bubble_result.get("warpDebug") or {}).get("inputRotationDeg", 0))
                warped_fb, _ = reproduce_warped_after_rotation(
                    img,
                    rot_deg,
                    detect_corner_fiducials,
                    compute_homography,
                    req.template,
                )
                src = warped_fb if warped_fb is not None else img
                annotated = debug_annotate_ballot(src, req.template or {}, bubble_result)

        _, buf = cv2.imencode(".png", annotated)
        img_b64 = base64.b64encode(buf.tobytes()).decode()

        selections = scan_result.get("selectionsByPosition") or {}
        bubble_result = scan_result.get("bubbleRead") or {}
        # TEMPORARY DEBUG
        for _ov in (bubble_result.get("bubbleOverlay") or []):
            _pid = str(_ov.get("positionId",""))[:20]
            _oid = str(_ov.get("optionId",""))[:25]
            _idr = float(_ov.get("innerDarkRatio", 0))
            _ccr = float(_ov.get("innerCcRatio", 0))
            _cmd = float(_ov.get("coreMeanDark", 0))
            _sc = float(_ov.get("score", 0))
            _cls = str(_ov.get("fillClassification", ""))
            print(f"BUBBLE {_pid:20s} {_oid:25s} idr={_idr:.3f} cc={_ccr:.3f} cmd={_cmd:.3f} sc={_sc:.3f} cls={_cls}")
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