"""
Layout-driven OMR v1 — deterministic pipeline:
  corner fiducials → single homography warp → canonical size → QR layout (0–1) → local ROI fill.
  By default fiducial homography is **off**; set ``OMR_FIDUCIAL_WARP=1`` to enable deskew.

No page-outline fallback, no post-warp normalization, no global bubble contour search.
"""

from __future__ import annotations

import os
from typing import Any

import cv2
import numpy as np

# Canonical warped space (single coordinate system for QR layout fractions).
CANONICAL_W = 1000
CANONICAL_H = 1400


def _fiducial_warp_env_enabled() -> bool:
    """Homography from edge fiducials is off unless ``OMR_FIDUCIAL_WARP=1`` (or true/yes)."""
    v = os.getenv("OMR_FIDUCIAL_WARP", "0").strip().lower()
    return v in ("1", "true", "yes")


def _resize_to_canonical_no_warp(bgr: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Straight resize to canonical size — layout fractions still map to the same canvas."""
    if bgr is None or bgr.size == 0 or bgr.ndim != 3:
        raise ValueError("resize_to_canonical: invalid BGR image")
    h, w = bgr.shape[:2]
    interp = (
        cv2.INTER_AREA
        if (w > CANONICAL_W or h > CANONICAL_H)
        else cv2.INTER_CUBIC
    )
    warped = cv2.resize(bgr, (CANONICAL_W, CANONICAL_H), interpolation=interp)
    meta: dict[str, Any] = {
        "warp_source": "disabled-resize-only",
        "fiducial_warp": False,
        "canonical": [CANONICAL_W, CANONICAL_H],
        "corner_confidence": 0.25,
    }
    return warped, meta

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

# Local bubble analysis — fixed circular ROI; optional ±REFINE_MAX_PX only (no wide snap search).
SEARCH_TOL_PX = 8  # legacy alias; refinement is capped at REFINE_MAX_PX
ROI_HALF = 12
FILL_THRESHOLD = 0.38
BUBBLE_R_CORE = 7
BUBBLE_R_RING = 11
REFINE_MAX_PX = 2


def rotate_input(img: np.ndarray, deg: int) -> np.ndarray:
    if deg == 0:
        return img
    if deg == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if deg == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    raise ValueError(f"unsupported rotation {deg}")


def _zone_fiducial_anchor_inv(
    gray_bin_inv: np.ndarray,
    xa: int,
    ya: int,
    xb: int,
    yb: int,
    aim_x: float | None,
    aim_y: float | None,
) -> tuple[float, float] | None:
    """
    Pick the strongest compact dark blob in the zone.
    For corner fiducials, use the contour point **closest to the sheet corner** (aim)
    instead of the centroid — centroids sit inset and bias homography (~up/left vs DOM).
    Mid-edge zones pass aim_x/aim_y None → centroid.
    """
    h, w = gray_bin_inv.shape
    x0, y0 = max(0, xa), max(0, ya)
    x1, y1 = min(w, xb), min(h, yb)
    if x1 <= x0 or y1 <= y0:
        return None
    roi = gray_bin_inv[y0:y1, x0:x1]
    contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best_c = None
    best_score = 0.0
    for c in contours:
        area = cv2.contourArea(c)
        if area < 30 or area > (roi.shape[0] * roi.shape[1] * 0.25):
            continue
        peri = cv2.arcLength(c, True)
        if peri < 1e-6:
            continue
        approx = cv2.approxPolyDP(c, 0.035 * peri, True)
        if len(approx) < 4 or len(approx) > 6:
            continue
        if area > best_score:
            best_score = area
            best_c = c
    if best_c is None:
        return None
    if aim_x is None or aim_y is None:
        M = cv2.moments(best_c)
        if M["m00"] < 1e-6:
            return None
        return float(M["m10"] / M["m00"] + x0), float(M["m01"] / M["m00"] + y0)
    pts = best_c.reshape(-1, 2).astype(np.float64)
    pts[:, 0] += x0
    pts[:, 1] += y0
    d2 = (pts[:, 0] - aim_x) ** 2 + (pts[:, 1] - aim_y) ** 2
    j = int(np.argmin(d2))
    return float(pts[j, 0]), float(pts[j, 1])


def _post_warp_fine_deskew(bgr: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Small rotation from dominant near-horizontal structure (contest rules / tables)."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hh, ww = gray.shape[:2]
    ry0, ry1 = int(hh * 0.06), int(hh * 0.72)
    rx0, rx1 = int(ww * 0.05), int(ww * 0.95)
    roi = gray[ry0:ry1, rx0:rx1]
    if roi.size < 400:
        return bgr, {"post_deskew_deg": 0.0}
    blur = cv2.GaussianBlur(roi, (3, 3), 0)
    edges = cv2.Canny(blur, 45, 135)
    thresh = max(55, min(roi.shape) // 3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180.0, threshold=thresh)
    if lines is None:
        return bgr, {"post_deskew_deg": 0.0, "post_deskew_lines": 0}
    skews: list[float] = []
    for i in range(min(len(lines), 220)):
        theta = float(lines[i][0][1])
        deg_from_horizontal = (theta - np.pi / 2.0) * 180.0 / np.pi
        while deg_from_horizontal > 90:
            deg_from_horizontal -= 180
        while deg_from_horizontal < -90:
            deg_from_horizontal += 180
        if abs(deg_from_horizontal) < 20.0:
            skews.append(deg_from_horizontal)
    if len(skews) < 5:
        return bgr, {"post_deskew_deg": 0.0, "post_deskew_lines": len(skews)}
    med = float(np.median(skews))
    if abs(med) < 0.18:
        return bgr, {"post_deskew_deg": 0.0, "post_deskew_median_raw": med}
    center = (ww / 2.0, hh / 2.0)
    M = cv2.getRotationMatrix2D(center, -med, 1.0)
    out = cv2.warpAffine(
        bgr,
        M,
        (ww, hh),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return out, {
        "post_deskew_deg": med,
        "post_deskew_samples": len(skews),
    }


def build_robust_fiducial_homography(bgr: np.ndarray) -> tuple[np.ndarray | None, dict[str, Any]]:
    """
    Up to 8 alignment marks (4 corners + 4 edge mids), with shallow top bands so TL/TR
    do not snap to interior timing rows. Uses RANSAC when 5+ points are found.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, inv = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = gray.shape[:2]
    m = int(min(w, h) * 0.18)
    top_band = max(18, int(min(w, h) * 0.11))
    edge_inset = max(2, int(min(w, h) * 0.01))
    hm = m // 2
    dw, dh = CANONICAL_W - 1, CANONICAL_H - 1

    zone_defs: list[tuple[tuple[int, int, int, int], tuple[int, int]]] = [
        ((0, 0, m, top_band), (0, 0)),
        ((w - m - edge_inset, 0, w - edge_inset, top_band), (dw, 0)),
        ((w - m - edge_inset, h - m - edge_inset, w - edge_inset, h - edge_inset), (dw, dh)),
        ((0, h - m - edge_inset, m, h - edge_inset), (0, dh)),
        ((w // 2 - hm, 0, w // 2 + hm, top_band), (dw // 2, 0)),
        ((w - m - edge_inset, h // 2 - hm, w - edge_inset, h // 2 + hm), (dw, dh // 2)),
        ((w // 2 - hm, h - m - edge_inset, w // 2 + hm, h - edge_inset), (dw // 2, dh)),
        ((0, h // 2 - hm, m, h // 2 + hm), (0, dh // 2)),
    ]

    # Corner rows: aim at image corners so anchors match physical sheet, not blob centers.
    aims: list[tuple[float | None, float | None]] = [
        (0.0, 0.0),
        (float(w - 1), 0.0),
        (float(w - 1), float(h - 1)),
        (0.0, float(h - 1)),
        (None, None),
        (None, None),
        (None, None),
        (None, None),
    ]

    src_list: list[tuple[float, float]] = []
    dst_list: list[tuple[int, int]] = []
    for idx, ((xa, ya, xb, yb), dst) in enumerate(zone_defs):
        aims_x, aims_y = aims[idx]
        c = _zone_fiducial_anchor_inv(inv, xa, ya, xb, yb, aims_x, aims_y)
        if c is not None:
            src_list.append(c)
            dst_list.append(dst)

    n = len(src_list)
    if n < 4:
        return None, {"error": "grid_insufficient", "grid_points": n}

    pts = np.array(src_list, dtype=np.float32).reshape(-1, 1, 2)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.02)
    cv2.cornerSubPix(gray, pts, (7, 7), (-1, -1), crit)
    src = pts.reshape(-1, 2)
    dst = np.array(dst_list, dtype=np.float32)

    ransac_th = float(max(2.2, min(w, h) * 0.0028))

    if n >= 8:
        Hl, _msk = cv2.findHomography(src, dst, cv2.LMEDS)
        if Hl is not None:
            meta_l: dict[str, Any] = {
                "warp_source": "fiducial-grid-lmeds",
                "grid_points": n,
                "grid_inliers": n,
                "corner_confidence": min(1.0, 0.72 + 0.02 * n),
            }
            return Hl, meta_l

    if n >= 5:
        H, mask = cv2.findHomography(
            src, dst, cv2.RANSAC, ransac_th, None, 3500, 0.995
        )
        if H is not None and mask is not None:
            inliers = int(mask.ravel().sum())
            if inliers >= 5:
                meta: dict[str, Any] = {
                    "warp_source": "fiducial-grid-ransac",
                    "grid_points": n,
                    "grid_inliers": inliers,
                    "corner_confidence": min(1.0, 0.52 + 0.065 * inliers),
                }
                return H, meta

    H4 = cv2.getPerspectiveTransform(src[:4], dst[:4])
    meta4: dict[str, Any] = {
        "warp_source": "fiducial-grid-4pt",
        "grid_points": n,
        "corner_confidence": float(min(1.0, 0.55 + 0.08 * n)),
    }
    return H4, meta4


def apply_corner_fiducial_warp_only(
    bgr: np.ndarray,
    detect_corner_fiducials: Any,
    compute_homography: Any,
) -> tuple[np.ndarray | None, dict[str, Any]]:
    """
    Prefer 4–8 point fiducial grid + RANSAC (tight top corners, edge mid anchors).
    Fallback: four unique corner-pattern centroids via detect_corner_fiducials.

    Set ``OMR_FIDUCIAL_WARP=1`` to enable homography deskew; default is resize-only (no fiducial warp).
    """
    if not _fiducial_warp_env_enabled():
        warped, meta = _resize_to_canonical_no_warp(bgr)
        return warped, meta

    H_grid, grid_meta = build_robust_fiducial_homography(bgr)
    if H_grid is not None:
        warped = cv2.warpPerspective(
            bgr, H_grid, (CANONICAL_W, CANONICAL_H), flags=cv2.INTER_LINEAR
        )
        warped, desk_meta = _post_warp_fine_deskew(warped)
        meta = {
            **grid_meta,
            **desk_meta,
            "canonical": [CANONICAL_W, CANONICAL_H],
            "corner_confidence": float(grid_meta.get("corner_confidence") or 0.0),
        }
        return warped, meta

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
    warped = cv2.warpPerspective(bgr, H, (CANONICAL_W, CANONICAL_H), flags=cv2.INTER_LINEAR)
    warped, desk_meta = _post_warp_fine_deskew(warped)
    meta = {
        **desk_meta,
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
    """
    Prefer measured template.geometry (print-aligned). QR-embedded layout is legacy:
    old QRs could carry election-wide contests and must not override geometry.
    If geometry includes an explicit ``contests`` key (even ``[]``), never merge QR contests
    (scan payload may omit contests so scoring uses gateway layout only).
    """
    geom = template.get("geometry")
    if isinstance(geom, dict):
        if "contests" in geom:
            g2 = geometry_to_normalized_contests(geom)
            return g2 if g2 else None
        g2 = geometry_to_normalized_contests(geom)
        if g2:
            return g2

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


def score_bubble_fixed_roi(
    gray: np.ndarray, cx0: int, cy0: int,
    r_core: int = BUBBLE_R_CORE, r_ring: int = BUBBLE_R_RING,
) -> tuple[float, int, int]:
    """Circular ROI ink vs ring; micro-search ±REFINE_MAX_PX only. Returns (score, cx, cy)."""
    h, w = gray.shape[:2]
    lim = r_ring + REFINE_MAX_PX + 2

    def one(cx: int, cy: int) -> float:
        if cx < lim or cy < lim or cx >= w - lim or cy >= h - lim:
            return -1.0
        x0, x1 = cx - r_ring, cx + r_ring + 1
        y0, y1 = cy - r_ring, cy + r_ring + 1
        patch = gray[y0:y1, x0:x1]
        if patch.size == 0:
            return 0.0
        ph, pw = patch.shape[:2]
        pxc, pyc = cx - x0, cy - y0
        yy, xx = np.ogrid[:ph, :pw]
        d2 = (xx - pxc) ** 2 + (yy - pyc) ** 2
        m_core = d2 <= r_core * r_core
        m_ring = (d2 > r_core * r_core) & (d2 <= r_ring * r_ring)
        if not np.any(m_core):
            return 0.0
        _, th = cv2.threshold(patch, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        ink_c = float(np.mean(th[m_core] > 128))
        ink_r = float(np.mean(th[m_ring] > 128)) if np.any(m_ring) else 0.0
        pen = max(0.0, ink_r - 0.12) * 1.85
        return float(max(0.0, ink_c - pen))

    best = float(one(cx0, cy0))
    bx, by = cx0, cy0
    for dy in range(-REFINE_MAX_PX, REFINE_MAX_PX + 1):
        for dx in range(-REFINE_MAX_PX, REFINE_MAX_PX + 1):
            if dx == 0 and dy == 0:
                continue
            s = float(one(cx0 + dx, cy0 + dy))
            if s > best + 1e-6:
                best = s
                bx, by = cx0 + dx, cy0 + dy
    return max(0.0, best), bx, by


def refine_bubble_fill(
    gray: np.ndarray, nx: float, ny: float, tol: int = SEARCH_TOL_PX
) -> tuple[float, int, int]:
    """Normalized center (nx,ny) in warped image [0,1]² → fixed ROI score + optional ±2 px."""
    _ = tol
    Hh, Ww = gray.shape[:2]
    cx0 = int(round(max(0, min(Ww - 1, nx * Ww))))
    cy0 = int(round(max(0, min(Hh - 1, ny * Hh))))
    return score_bubble_fixed_roi(gray, cx0, cy0)


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
    Hh, Ww = gray.shape[:2]
    page = template.get("page") or {}
    page_w = float(page.get("width") or CANONICAL_W)
    page_h = float(page.get("height") or CANONICAL_H)

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

        for b in contest.get("bubbles") or []:
            oid = str(b["optionId"])

            bx = float(b.get("x") or 0.0)
            by = float(b.get("y") or 0.0)
            bw = float(b.get("w") or 0.0)
            bh = float(b.get("h") or 0.0)

            if bw > 1e-9 or bh > 1e-9:
                cx_p = bx + bw / 2.0
                cy_p = by + bh / 2.0
                nx = cx_p / page_w
                ny = cy_p / page_h
            else:
                nx, ny = bx, by
            nx = max(0.0, min(1.0, nx))
            ny = max(0.0, min(1.0, ny))

            ex_px = int(round(nx * Ww))
            ey_px = int(round(ny * Hh))

            fill_r, rx, ry = refine_bubble_fill(gray, nx, ny)
            scores[oid] = fill_r

            layout_debug.append(
                {
                    "contestId": cid,
                    "optionId": oid,
                    "nx": nx,
                    "ny": ny,
                    "expected_px": [ex_px, ey_px],
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
        rx, ry = int(row["refined_px"][0]), int(row["refined_px"][1])
        if "expected_px" in row:
            ex, ey = int(row["expected_px"][0]), int(row["expected_px"][1])
            cv2.circle(canvas, (ex, ey), 4, (255, 0, 0), 1)  # blue = expected (BGR)
            if (ex, ey) != (rx, ry):
                cv2.line(canvas, (ex, ey), (rx, ry), (0, 255, 255), 1)
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
