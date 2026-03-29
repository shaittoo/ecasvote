"""
Layout-driven OMR v1 — deterministic pipeline:
  corner fiducials → single homography warp → canonical size → QR layout (0–1) → local ROI fill.

No page-outline fallback, no post-warp normalization, no global bubble contour search.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

# Canonical warped space (single coordinate system for QR layout fractions).
CANONICAL_W = 1000
CANONICAL_H = 1400

# QR search zone in warped image (footer, normalized 0–1). Not tied to legacy LAYOUT_SPEC.
QR_ZONE_X0 = 0.68
QR_ZONE_X1 = 0.995
QR_ZONE_Y0 = 0.74
QR_ZONE_Y1 = 0.995

# Dedicated bottom-right crop (tight on QR; avoids edge clipping issues when paired with upscaling).
BR_QR_X0 = 0.78
BR_QR_X1 = 0.98
BR_QR_Y0 = 0.78
BR_QR_Y1 = 0.98

# Local bubble analysis
SEARCH_TOL_PX = 8
ROI_HALF = 12
FILL_THRESHOLD = 0.38


def rotate_input(img: np.ndarray, deg: int) -> np.ndarray:
    if deg == 0:
        return img
    if deg == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if deg == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    raise ValueError(f"unsupported rotation {deg}")


def apply_corner_fiducial_warp_only(
    bgr: np.ndarray,
    detect_corner_fiducials: Any,
    compute_homography: Any,
) -> tuple[np.ndarray | None, dict[str, Any]]:
    """Warp using exactly four corner zone centroids. No other fallbacks."""
    fid = detect_corner_fiducials(bgr)
    found: dict[str, Any] = fid.get("found") or {}
    corners: dict[str, tuple[float, float]] = {}
    for zone in ("img_tl", "img_tr", "img_br", "img_bl"):
        if zone in found:
            corners[zone] = tuple(found[zone]["centroid"])  # type: ignore[index]
    if len(corners) < 4:
        return None, {
            "error": "insufficient_corner_fiducials",
            "found_zones": list(found.keys()),
            "canonical": [CANONICAL_W, CANONICAL_H],
            "warp_source": "none",
        }
    H = compute_homography(corners, CANONICAL_W, CANONICAL_H)
    if H is None:
        return None, {"error": "homography_failed", "canonical": [CANONICAL_W, CANONICAL_H]}
    warped = cv2.warpPerspective(bgr, H, (CANONICAL_W, CANONICAL_H))
    meta = {
        "canonical": [CANONICAL_W, CANONICAL_H],
        "warp_source": "corner-fiducials-4",
        "corner_confidence": float(fid.get("confidence") or 0.0),
        "fiducial_centroids_src": {k: [float(corners[k][0]), float(corners[k][1])] for k in corners},
    }
    return warped, meta


def _qr_decode_bgr(det: cv2.QRCodeDetector, bgr: np.ndarray) -> str | None:
    if bgr is None or bgr.size == 0 or bgr.ndim != 3:
        return None
    txt, _, _ = det.detectAndDecode(bgr)
    if not txt or not str(txt).strip():
        return None
    return str(txt).strip()


def _preprocess_qr_candidates(bgr: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """OpenCV-only variants for small QR modules (upscale / threshold / sharpen)."""
    out: list[tuple[str, np.ndarray]] = []
    if bgr is None or bgr.size == 0 or bgr.ndim != 3:
        return out
    h, w = bgr.shape[:2]
    if h < 8 or w < 8:
        return out

    out.append(("bgr", bgr.copy()))

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    out.append(("gray", cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)))

    g2 = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    out.append(("gray_2x", cv2.cvtColor(g2, cv2.COLOR_GRAY2BGR)))

    g3 = cv2.resize(gray, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
    out.append(("gray_3x", cv2.cvtColor(g3, cv2.COLOR_GRAY2BGR)))

    b2 = cv2.resize(bgr, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    out.append(("bgr_2x", b2))

    b3 = cv2.resize(bgr, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
    out.append(("bgr_3x", b3))

    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(("otsu_bin", cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)))
    _, otsu_inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    out.append(("otsu_inv", cv2.cvtColor(otsu_inv, cv2.COLOR_GRAY2BGR)))

    blur = cv2.GaussianBlur(gray, (0, 0), 1.0)
    sharp = cv2.addWeighted(gray, 1.5, blur, -0.5, 0)
    sharp_u8 = np.clip(sharp, 0, 255).astype(np.uint8)
    out.append(("sharpen", cv2.cvtColor(sharp_u8, cv2.COLOR_GRAY2BGR)))

    g2o = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    _, o2 = cv2.threshold(g2o, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(("gray_2x_otsu", cv2.cvtColor(o2, cv2.COLOR_GRAY2BGR)))

    eq = cv2.equalizeHist(gray)
    out.append(("eq_hist", cv2.cvtColor(eq, cv2.COLOR_GRAY2BGR)))

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(gray)
    out.append(("clahe", cv2.cvtColor(cl, cv2.COLOR_GRAY2BGR)))

    return out


def decode_ballot_qr_from_warped(
    warped_bgr: np.ndarray,
    parse_ballot_qr_dict: Any,
) -> tuple[dict[str, Any] | None, str | None, float, dict[str, Any]]:
    """
    Post-warp QR decode: full image, then bottom-right crops with multiple preprocessings.
    Returns first successful parse_ballot_qr_dict(...) result.
    """
    det = cv2.QRCodeDetector()
    H, W = warped_bgr.shape[:2]
    attempts_tried: list[dict[str, Any]] = []
    last_raw: str | None = None
    last_decoded_non_json: str | None = None

    def _try_stage(
        stage: str, crop_rect: tuple[int, int, int, int] | None, name: str, img: np.ndarray
    ) -> dict[str, Any] | None:
        nonlocal last_raw, last_decoded_non_json
        raw = _qr_decode_bgr(det, img)
        rec: dict[str, Any] = {
            "stage": stage,
            "method": name,
            "cropRect": list(crop_rect) if crop_rect else None,
            "decodedLen": len(raw) if raw else 0,
            "parsed": False,
            "ok": False,
        }
        if not raw:
            attempts_tried.append(rec)
            return None
        obj = parse_ballot_qr_dict(raw)
        rec["parsed"] = obj is not None
        if obj is None:
            last_decoded_non_json = raw[:200] if raw else None
            attempts_tried.append(rec)
            return None
        rec["ok"] = True
        attempts_tried.append(rec)
        last_raw = raw
        return obj

    def _finish(
        obj: dict[str, Any],
        raw: str,
        conf: float,
        method: str,
        crop_rect: list[int] | None,
        extra: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any] | None, str | None, float, dict[str, Any]]:
        dbg = {
            "method": method,
            "cropRect": crop_rect,
            "attemptsTried": attempts_tried,
            "imageSize": [W, H],
        }
        if extra:
            dbg.update(extra)
        return obj, raw, conf, dbg

    # --- Attempt A: full page ---
    full_variants = _preprocess_qr_candidates(warped_bgr)
    priority_full = ("bgr", "gray", "eq_hist", "clahe", "gray_2x", "bgr_2x", "otsu_inv")
    seen: set[str] = set()
    for key in priority_full:
        for name, im in full_variants:
            if name != key:
                continue
            seen.add(name)
            obj = _try_stage("full_page", None, f"full_{name}", im)
            if obj is not None and last_raw is not None:
                conf = 0.96 if name == "bgr" else 0.92
                return _finish(obj, last_raw, conf, f"full_page:{name}", None)
    for name, im in full_variants:
        if name in seen:
            continue
        obj = _try_stage("full_page", None, f"full_{name}", im)
        if obj is not None and last_raw is not None:
            return _finish(obj, last_raw, 0.88, f"full_page:{name}", None)

    # --- Attempt B: bottom-right 78–98 % ---
    def _run_crop(
        stage: str, x0: int, x1: int, y0: int, y1: int
    ) -> tuple[dict[str, Any] | None, str | None, float, dict[str, Any]] | None:
        x0c, x1c = max(0, x0), min(W, x1)
        y0c, y1c = max(0, y0), min(H, y1)
        if x1c <= x0c or y1c <= y0c:
            return None
        crop = warped_bgr[y0c:y1c, x0c:x1c]
        rect = [x0c, y0c, x1c, y1c]
        for name, im in _preprocess_qr_candidates(crop):
            obj = _try_stage(stage, (x0c, y0c, x1c, y1c), f"{stage}_{name}", im)
            if obj is not None and last_raw is not None:
                return _finish(
                    obj,
                    last_raw,
                    0.93,
                    f"{stage}:{name}",
                    rect,
                    {"cropSize": [x1c - x0c, y1c - y0c]},
                )
        return None

    x0_br = int(W * BR_QR_X0)
    x1_br = int(W * BR_QR_X1)
    y0_br = int(H * BR_QR_Y0)
    y1_br = int(H * BR_QR_Y1)
    got = _run_crop("bottom_right_78_98", x0_br, x1_br, y0_br, y1_br)
    if got is not None:
        return got

    # --- Attempt C: legacy wide footer zone ---
    x0_l = int(W * QR_ZONE_X0)
    x1_l = int(W * QR_ZONE_X1)
    y0_l = int(H * QR_ZONE_Y0)
    y1_l = int(H * QR_ZONE_Y1)
    got2 = _run_crop("footer_zone_legacy", x0_l, x1_l, y0_l, y1_l)
    if got2 is not None:
        return got2

    dbg: dict[str, Any] = {
        "method": None,
        "cropRect": [x0_br, y0_br, x1_br, y1_br],
        "attemptsTried": attempts_tried,
        "failureReason": "no_valid_ballot_qr_json",
        "imageSize": [W, H],
        "lastDecodedSnippet": last_decoded_non_json,
        "hint": "Print: larger QR modules, inset from page edge, preserve white quiet zone (CSS).",
    }
    return None, last_raw, 0.0, dbg


def decode_qr_on_warped(
    warped_bgr: np.ndarray,
    parse_ballot_qr_dict: Any,
) -> tuple[dict[str, Any] | None, str | None, float, dict[str, Any]]:
    """Backward-compatible alias for :func:`decode_ballot_qr_from_warped`."""
    return decode_ballot_qr_from_warped(warped_bgr, parse_ballot_qr_dict)


def geometry_to_normalized_contests(geom: dict[str, Any]) -> list[dict[str, Any]]:
    page = geom.get("page") or {}
    pw = float(page.get("width") or 0)
    ph = float(page.get("height") or 0)
    if pw <= 0 or ph <= 0:
        return []
    out: list[dict[str, Any]] = []
    for c in geom.get("contests") or []:
        pid = str(c.get("positionId") or "")
        if not pid:
            continue
        bubbles_out: list[dict[str, Any]] = []
        for b in c.get("bubbles") or []:
            oid = str(b.get("optionId") or "")
            if not oid:
                continue
            xf = float(b.get("x") or 0)
            yf = float(b.get("y") or 0)
            wf = float(b.get("w") or 0)
            hf = float(b.get("h") or 0)
            cx = (xf + 0.5 * wf) / pw
            cy = (yf + 0.5 * hf) / ph
            bubbles_out.append({"optionId": oid, "x": cx, "y": cy})
        out.append(
            {
                "id": pid,
                "maxVotes": int(c.get("maxVotes") or 1),
                "bubbles": bubbles_out,
            }
        )
    return out


def build_contests_layout(qr_obj: dict[str, Any] | None, template: dict[str, Any]) -> list[dict[str, Any]] | None:
    if qr_obj and isinstance(qr_obj.get("layout"), dict):
        lc = qr_obj["layout"].get("contests")
        if isinstance(lc, list) and len(lc) > 0:
            norm: list[dict[str, Any]] = []
            for c in lc:
                if not isinstance(c, dict):
                    continue
                cid = str(c.get("id") or c.get("positionId") or "")
                if not cid:
                    continue
                bubbles: list[dict[str, Any]] = []
                for b in c.get("bubbles") or []:
                    if not isinstance(b, dict):
                        continue
                    oid = str(b.get("optionId") or "")
                    if not oid:
                        continue
                    bubbles.append(
                        {
                            "optionId": oid,
                            "x": float(b["x"]),
                            "y": float(b["y"]),
                        }
                    )
                norm.append(
                    {
                        "id": cid,
                        "maxVotes": int(c.get("maxVotes") or 1),
                        "bubbles": bubbles,
                    }
                )
            return norm if norm else None

    geom = template.get("geometry")
    if isinstance(geom, dict):
        g2 = geometry_to_normalized_contests(geom)
        return g2 if g2 else None
    return None


def mean_dark_ratio_otsu(gray: np.ndarray, cx: int, cy: int, half: int) -> float:
    h, w = gray.shape[:2]
    x0, x1 = max(0, cx - half), min(w, cx + half + 1)
    y0, y1 = max(0, cy - half), min(h, cy + half + 1)
    patch = gray[y0:y1, x0:x1]
    if patch.size == 0:
        return 0.0
    _, th = cv2.threshold(patch, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return float(np.mean(th > 128))


def refine_bubble_fill(
    gray: np.ndarray, nx: float, ny: float, tol: int = SEARCH_TOL_PX
) -> tuple[float, int, int]:
    """
    Deterministic local search: integer offsets with r <= tol; tie-break (-score, dx, dy) lex order.
    """
    Hh, Ww = gray.shape[:2]
    cx = int(round(nx * Ww))
    cy = int(round(ny * Hh))
    cx = max(tol, min(Ww - 1 - tol, cx))
    cy = max(tol, min(Hh - 1 - tol, cy))

    best_r = -1.0
    best_dx, best_dy = 0, 0
    for dy in range(-tol, tol + 1):
        for dx in range(-tol, tol + 1):
            if dx * dx + dy * dy > tol * tol:
                continue
            px, py = cx + dx, cy + dy
            r = mean_dark_ratio_otsu(gray, px, py, ROI_HALF)
            if r > best_r or (
                abs(r - best_r) < 1e-9 and (dx, dy) < (best_dx, best_dy)
            ):
                best_r = r
                best_dx, best_dy = dx, dy
    rx, ry = cx + best_dx, cy + best_dy
    return best_r, rx, ry


def _is_abstain(oid: str) -> bool:
    return oid.startswith("abstain:")


def select_marks_fill(
    scores: dict[str, float],
    max_votes: int,
) -> tuple[list[str], dict[str, Any]]:
    if not scores or max_votes < 1:
        return [], {"confidence": 0.0}
    ordered = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    vals = [v for _, v in ordered]
    med = float(np.median(vals)) if vals else 0.0
    top = float(ordered[0][1])
    second = float(ordered[1][1]) if len(ordered) > 1 else 0.0
    margin = top - second
    # Deterministic threshold: global floor + local spread
    floor = max(FILL_THRESHOLD, med + 0.04)
    candidates = [(o, s) for o, s in ordered if s >= floor]
    picks = [o for o, _ in candidates[:max_votes]]
    meta: dict[str, Any] = {
        "confidence": min(1.0, max(0.0, (top - med) * 2.0 + margin * 0.5))
    }
    has_abs = any(_is_abstain(x) for x in picks)
    has_cand = any(not _is_abstain(x) for x in picks)
    if has_abs and has_cand:
        picks = []
        meta["abstain_conflict"] = True
        meta["confidence"] = 0.0
    return picks, meta


def run_layout_scan_on_bgr(
    img_bgr: np.ndarray,
    template: dict[str, Any],
    detect_corner_fiducials: Any,
    compute_homography: Any,
    parse_ballot_qr_dict: Any,
) -> dict[str, Any]:
    warped, wmeta = apply_corner_fiducial_warp_only(
        img_bgr, detect_corner_fiducials, compute_homography
    )
    if warped is None:
        return {
            "warpFailed": True,
            "warpMeta": wmeta,
            "qr": None,
            "qrRaw": None,
            "bubbleRead": {
                "error": "fiducial_warp_failed",
                "confidence": 0.0,
                "pipeline": "layout-v1",
            },
            "selectionsByPosition": {},
            "rawBubbleScores": {},
        }

    qr_obj, qr_raw, qr_conf, qr_dbg = decode_qr_on_warped(warped, parse_ballot_qr_dict)
    contests = build_contests_layout(qr_obj, template)

    if not contests:
        return {
            "warpFailed": False,
            "warped": warped,
            "warpMeta": wmeta,
            "qr": qr_obj,
            "qrRaw": qr_raw,
            "qrConfidence": qr_conf,
            "qrDebug": qr_dbg,
            "bubbleRead": {
                "error": "no_layout",
                "confidence": 0.0,
                "pipeline": "layout-v1",
            },
            "selectionsByPosition": {},
            "rawBubbleScores": {},
        }

    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    raw_scores: dict[str, dict[str, float]] = {}
    selections: dict[str, list[str]] = {}
    contest_confs: list[float] = []
    layout_debug: list[dict[str, Any]] = []

    spec_by_pid = {
        str(c.get("positionId") or ""): c
        for c in (template.get("contests") or [])
        if c.get("positionId")
    }

    for contest in contests:
        cid = str(contest["id"])
        spec = spec_by_pid.get(cid) or {}
        max_v = int(contest.get("maxVotes") or spec.get("maxMarks") or 1)
        scores: dict[str, float] = {}
        page = template.get("page") or {}
        page_w = float(page.get("width") or 1.0)
        page_h = float(page.get("height") or 1.0)

        for b in contest.get("bubbles") or []:
            oid = str(b["optionId"])

            bx = float(b.get("x") or 0.0)
            by = float(b.get("y") or 0.0)
            bw = float(b.get("w") or 0.0)
            bh = float(b.get("h") or 0.0)

            # center in page space
            cx_page = bx + bw / 2.0
            cy_page = by + bh / 2.0

            # normalize directly
            nx = cx_page / page_w
            ny = cy_page / page_h

            fill_r, rx, ry = refine_bubble_fill(gray, nx, ny)
            scores[oid] = fill_r

            layout_debug.append(
                {
                    "contestId": cid,
                    "optionId": oid,
                    "page_center": [cx_page, cy_page],
                    "refined_px": [rx, ry],
                    "fillRatio": fill_r,
                }
            )
        raw_scores[cid] = scores
        picks, meta = select_marks_fill(scores, max_v)
        selections[cid] = picks
        contest_confs.append(float(meta.get("confidence") or 0.0))

    overall = float(np.mean(contest_confs)) if contest_confs else 0.0
    overall = max(0.0, min(1.0, overall * 0.5 + qr_conf * 0.5))

    ballot_id = None
    election_id = None
    if isinstance(qr_obj, dict):
        ballot_id = qr_obj.get("ballotId") or qr_obj.get("ballotToken")
        election_id = qr_obj.get("electionId")

    return {
        "warpFailed": False,
        "warped": warped,
        "warpMeta": wmeta,
        "qr": qr_obj,
        "qrRaw": qr_raw,
        "qrConfidence": qr_conf,
        "qrDebug": qr_dbg,
        "ballotId": ballot_id,
        "electionId": election_id,
        "bubbleRead": {
            "error": None,
            "confidence": overall,
            "pipeline": "layout-v1",
            "contestsDetected": len(contests),
            "contestsInTemplate": len(contests),
            "layoutDebug": layout_debug,
            "qrDecodeConfidence": qr_conf,
        },
        "selectionsByPosition": selections,
        "rawBubbleScores": raw_scores,
    }


def layout_scan_quality(res: dict[str, Any]) -> float:
    if res.get("warpFailed"):
        return -1e6
    br = res.get("bubbleRead") or {}
    if br.get("error"):
        q = -100.0
        if br.get("error") == "no_layout":
            q = -50.0
        if res.get("qr"):
            q += 2.0
        return q
    q = float(br.get("confidence") or 0.0) * 10.0
    if res.get("qr"):
        q += 3.0
    q += float(res.get("qrConfidence") or 0.0) * 2.0
    return q


def annotate_warped_layout(
    warped_bgr: np.ndarray,
    layout_debug: list[dict[str, Any]],
    selections: dict[str, list[str]],
) -> np.ndarray:
    """Debug overlay on the same warped image as the scan: canonical corners + bubble marks."""
    canvas = warped_bgr.copy()
    H, W = canvas.shape[:2]
    for pt in ((0, 0), (W - 1, 0), (W - 1, H - 1), (0, H - 1)):
        cv2.drawMarker(canvas, pt, (0, 255, 80), cv2.MARKER_CROSS, 10, 2)
    # layoutDebug uses refined_px in warped coordinates
    picked_flat: set[str] = set()
    for _pid, ids in (selections or {}).items():
        for x in ids:
            picked_flat.add(x)

    for row in layout_debug:
        if "expected_px" in row:
            ex, ey = int(row["expected_px"][0]), int(row["expected_px"][1])
            cv2.circle(canvas, (ex, ey), 5, (255, 0, 0), 1)  # blue = expected
        rx, ry = int(row["refined_px"][0]), int(row["refined_px"][1])
        oid = str(row.get("optionId") or "")
        fr = float(row.get("fillRatio") or 0.0)
        col = (0, 255, 0) if oid in picked_flat else ((0, 200, 255) if fr >= FILL_THRESHOLD else (60, 60, 255))
        cv2.circle(canvas, (rx, ry), 10, col, 2)
        cv2.putText(
            canvas,
            f"{fr:.2f}",
            (min(W - 40, rx + 8), min(H - 4, ry + 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.28,
            (220, 220, 220),
            1,
            cv2.LINE_AA,
        )
    cv2.putText(canvas, "layout-v1", (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return canvas


def reproduce_warped_after_rotation(
    img_bgr: np.ndarray,
    rotation_deg: int,
    detect_corner_fiducials: Any,
    compute_homography: Any,
) -> tuple[np.ndarray | None, dict[str, Any]]:
    """Re-run the same fiducial warp as scan (for /debug parity)."""
    rotated = rotate_input(img_bgr, rotation_deg)
    return apply_corner_fiducial_warp_only(rotated, detect_corner_fiducials, compute_homography)
