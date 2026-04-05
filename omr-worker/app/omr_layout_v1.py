"""
Layout-driven OMR v1 — bubble-only OMR pipeline:
  up to 8 fiducial squares → single homography warp → canonical size → template ROIs only.

Environment:
  OMR_FIDUCIAL_WARP   Default ``1`` (on). Set to ``0`` / ``false`` / ``off`` to use resize-only
                        (no perspective; for debugging only).
  OMR_POST_WARP_DESKEW  Default ``0``. Set to ``1`` to run a second Hough deskew after fiducial
                        warp (can shift bubble geometry; prefer off when fiducials succeed).
  OMR_BUBBLE_CLAHE    Default ``1``: CLAHE on luminance before bubble scoring. Set ``0`` to disable.

Scoring uses only small circular ROIs at expected bubble centers inside a content mask; headers,
timing strips, QR, and table lines outside the mask are ignored for ink statistics.

  OMR_BUBBLE_LOCALIZE       Default ``1`` — ring-gradient search ±``OMR_BUBBLE_LOCALIZE_HALF`` px
                            to snap each bubble center before fill classification.
  OMR_BUBBLE_LOCALIZE_HALF  Default ``12`` (max ±12 px adjustment per axis).

Fill classification (after localization) uses hard gates, then a ballot-wide empty-bubble model
(likely-empty subset → median references), then contest-local blank dominance, then
``fill_score_raw`` for eligible bubbles. Optional luminance + CLAHE preprocessing before ROI
scoring (``OMR_BUBBLE_CLAHE``). Contests require a winner separation margin between selected and
next-best scores.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from app.ballot_template_v2 import LAYOUT_SPEC

# Canonical warped space (single coordinate system for QR layout fractions).
CANONICAL_W = 1000
CANONICAL_H = 1400


def _fiducial_warp_env_enabled() -> bool:
    """Perspective warp from up to 8 fiducials is on by default; disable with ``OMR_FIDUCIAL_WARP=0``."""
    v = os.getenv("OMR_FIDUCIAL_WARP", "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _post_warp_deskew_env_enabled() -> bool:
    """Optional second deskew after fiducial warp (default off — avoids coordinate drift)."""
    v = os.getenv("OMR_POST_WARP_DESKEW", "0").strip().lower()
    return v in ("1", "true", "yes", "on")


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

# QR search zones (normalized 0–1) — match ballot-template-v2 footer QR placement on the warped sheet.
BR_QR_X0 = LAYOUT_SPEC.qr_zone_x0
BR_QR_X1 = LAYOUT_SPEC.qr_zone_x1
BR_QR_Y0 = LAYOUT_SPEC.qr_zone_y0
BR_QR_Y1 = LAYOUT_SPEC.qr_zone_y1

# Wider fallback crop if the tight v2 box misses (skew, margin, or decode upscaling).
QR_ZONE_X0 = max(0.0, LAYOUT_SPEC.qr_zone_x0 - 0.04)
QR_ZONE_X1 = min(1.0, LAYOUT_SPEC.qr_zone_x1 + 0.025)
QR_ZONE_Y0 = max(0.0, LAYOUT_SPEC.qr_zone_y0 - 0.06)
QR_ZONE_Y1 = min(1.0, LAYOUT_SPEC.qr_zone_y1 + 0.01)

# Local bubble analysis — fixed circular ROI; optional ±REFINE_MAX_PX only (no wide snap search).
SEARCH_TOL_PX = 8  # legacy alias; refinement is capped at REFINE_MAX_PX
ROI_HALF = 12
FILL_THRESHOLD = 0.08
# Threshold for counting a bubble as a mark (requires hard gates + winner margin first).
STRICT_BUBBLE_MARK_THRESHOLD = 0.24
# Scores in [AMBIGUOUS_SCORE_HIGH, threshold) count as ambiguous when hard gates passed.
AMBIGUOUS_SCORE_HIGH = 0.19
# Hard gates (all must pass before any fill score can count).
HARD_INNER_DARK_MIN = 0.4
HARD_INNER_CC_MIN = 0.3
HARD_CORE_MEAN_DARK_MIN = 0.10
HARD_RING_INNER_MARGIN = 0.08
# Last selected bubble must beat the best non-selected score by at least this (contest tie-break).
WINNER_SEPARATION_MARGIN = 0.04
# Contest-local “blank” profile: percentile of each metric across all options in the contest.
CONTEST_BLANK_PERCENTILE = 33
# After hard gates, a bubble must exceed that blank profile by these deltas (multi-metric).
DOMINANCE_DELTA_INNER = 0.07
DOMINANCE_DELTA_CC = 0.09
DOMINANCE_DELTA_CORE = 0.045
DOMINANCE_DELTA_SCORE = 0.055
# Ballot-wide empty reference: bubble must exceed these vs median likely-empty pool.
BALLOT_DOMINANCE_DELTA_INNER = 0.055
BALLOT_DOMINANCE_DELTA_CC = 0.075
BALLOT_DOMINANCE_DELTA_CORE = 0.042
BALLOT_DOMINANCE_DELTA_SCORE = 0.048
# Conservative “likely empty” — interior quiet, printed ring visible.
LIKELY_EMPTY_INNER_MAX = 0.36
LIKELY_EMPTY_CC_MAX = 0.27
LIKELY_EMPTY_SCORE_MAX = 0.12
LIKELY_EMPTY_CORE_MAX = 0.13
LIKELY_EMPTY_RING_OVER_INNER_MIN = 0.012  # ring_ink > inner + this
MIN_BALLOT_EMPTY_SAMPLES = 4
BALLOT_EMPTY_FALLBACK_FRAC = 0.35  # lowest this fraction by emptiness index if strict pool small
BUBBLE_R_CORE = 5
BUBBLE_R_RING = 9
# Strict interior disk (inside printed ring) for fill evidence — smaller than BUBBLE_R_CORE.
BUBBLE_R_INNER = 3
REFINE_MAX_PX = 2
# Localize printed bubble outline before fill (±half on each axis, default 12 → ±12 px).
LOCALIZE_SEARCH_HALF_DEFAULT = 12


def _bubble_localize_enabled() -> bool:
    return os.getenv("OMR_BUBBLE_LOCALIZE", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _localize_search_half() -> int:
    raw = os.getenv("OMR_BUBBLE_LOCALIZE_HALF", "").strip()
    if raw.isdigit():
        return max(4, min(20, int(raw)))
    return LOCALIZE_SEARCH_HALF_DEFAULT


def _bubble_scoring_clahe_enabled() -> bool:
    """Local CLAHE on luminance before bubble ROI stats (default on; set ``OMR_BUBBLE_CLAHE=0`` to disable)."""
    v = os.getenv("OMR_BUBBLE_CLAHE", "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def prepare_bubble_scoring_gray(warped_bgr: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """
    BT.601 luminance from BGR (reduces pink/red cast vs ``cvtColor(BGR2GRAY)``), optional CLAHE.
    Does not change geometry — only the single-channel image passed to ``score_bubble_fixed_roi``.
    """
    if warped_bgr is None or warped_bgr.size == 0 or warped_bgr.ndim != 3:
        raise ValueError("prepare_bubble_scoring_gray: invalid BGR image")
    b, g, r = cv2.split(warped_bgr.astype(np.float32))
    gray_f = 0.114 * b + 0.587 * g + 0.299 * r
    gray = np.clip(gray_f, 0, 255).astype(np.uint8)
    meta: dict[str, Any] = {"graySource": "bt601_luma", "claheApplied": False}
    if _bubble_scoring_clahe_enabled():
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        meta["claheApplied"] = True
    return gray, meta


@dataclass(frozen=True)
class BubbleRoiScore:
    """Stage A: localize printed circle; stage B: fill evidence at ``evaluated`` center."""

    fill_score: float
    expected_cx: int
    expected_cy: int
    localized_cx: int
    localized_cy: int
    evaluated_cx: int
    evaluated_cy: int
    localize_quality: float
    localize_raw: float
    # --- fill evidence; see fill_hard_gate_failures + ballot/contest dominance ---
    inner_dark_ratio: float = 0.0
    ring_ink_ratio: float = 0.0
    core_mean_dark: float = 0.0
    inner_cc_ratio: float = 0.0
    fill_score_raw: float = 0.0
    ring_core_delta: float = 0.0


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

    fid_meta = {
        "fiducialCorrespondences": {
            "srcImage": [[float(p[0]), float(p[1])] for p in src_list],
            "dstCanonical": [[int(p[0]), int(p[1])] for p in dst_list],
            "pointCount": n,
        }
    }

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
                "fiducial_warp": True,
                **fid_meta,
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
                    "fiducial_warp": True,
                    **fid_meta,
                }
                return H, meta

    H4 = cv2.getPerspectiveTransform(src[:4], dst[:4])
    meta4: dict[str, Any] = {
        "warp_source": "fiducial-grid-4pt",
        "grid_points": n,
        "corner_confidence": float(min(1.0, 0.55 + 0.08 * n)),
        "fiducial_warp": True,
        **fid_meta,
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

    Default: 8-point (or 4–7) fiducial homography to canonical size. Disable with ``OMR_FIDUCIAL_WARP=0``.
    """
    if not _fiducial_warp_env_enabled():
        warped, meta = _resize_to_canonical_no_warp(bgr)
        return warped, meta

    H_grid, grid_meta = build_robust_fiducial_homography(bgr)
    if H_grid is not None:
        warped = cv2.warpPerspective(
            bgr, H_grid, (CANONICAL_W, CANONICAL_H), flags=cv2.INTER_LINEAR
        )
        if _post_warp_deskew_env_enabled():
            warped, desk_meta = _post_warp_fine_deskew(warped)
        else:
            desk_meta = {"post_deskew_deg": 0.0, "post_deskew_skipped": True}
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
    if _post_warp_deskew_env_enabled():
        warped, desk_meta = _post_warp_fine_deskew(warped)
    else:
        desk_meta = {"post_deskew_deg": 0.0, "post_deskew_skipped": True}
    meta = {
        **desk_meta,
        "canonical": [CANONICAL_W, CANONICAL_H],
        "warp_source": "corner-fiducials-4",
        "corner_confidence": float(fid.get("confidence") or 0.0),
        "fiducial_warp": True,
        "grid_points": 4,
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
    got = _run_crop("bottom_right_v2_qr_zone", x0_br, x1_br, y0_br, y1_br)
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
            if abs(pw - 1.0) < 0.01:
                # Legacy: top-left + size already in 0–1; page.height was aspect ratio, not a Y scale.
                cx = xf + 0.5 * wf
                cy = yf + 0.5 * hf
            else:
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


def build_bubble_scoring_mask(h: int, w: int) -> np.ndarray:
    """
    255 = pixels that may contribute to bubble fill scores; 0 = structural noise
    (timing strips, corners, header/footer bands, QR, text lanes outside contests).

    Only the interior contest band (between LAYOUT_SPEC.contests_y0 and above the QR zone)
    inside the content margins is active — matching where vote bubbles are printed.
    """
    m = np.zeros((h, w), dtype=np.uint8)
    if h < 8 or w < 8:
        return m
    x0 = int(w * LAYOUT_SPEC.content_x0)
    x1 = int(w * LAYOUT_SPEC.content_x1)
    y0 = int(h * LAYOUT_SPEC.contests_y0)
    y_top_qr = min(LAYOUT_SPEC.contests_y1, LAYOUT_SPEC.qr_zone_y0 - 0.02)
    y1 = int(h * y_top_qr)
    x0, x1 = max(0, x0), min(w, x1)
    y0, y1 = max(0, y0), min(h, y1)
    if x1 > x0 and y1 > y0:
        m[y0:y1, x0:x1] = 255
    qx0 = int(w * LAYOUT_SPEC.qr_zone_x0)
    qx1 = int(w * LAYOUT_SPEC.qr_zone_x1)
    qy0 = int(h * LAYOUT_SPEC.qr_zone_y0)
    qy1 = int(h * min(1.0, LAYOUT_SPEC.qr_zone_y1 + 0.01))
    qx0, qx1 = max(0, qx0), min(w, qx1)
    qy0, qy1 = max(0, qy0), min(h, qy1)
    if qx1 > qx0 and qy1 > qy0:
        m[qy0:qy1, qx0:qx1] = 0
    return m


def mean_dark_ratio_otsu(gray: np.ndarray, cx: int, cy: int, half: int) -> float:
    h, w = gray.shape[:2]
    x0, x1 = max(0, cx - half), min(w, cx + half + 1)
    y0, y1 = max(0, cy - half), min(h, cy + half + 1)
    patch = gray[y0:y1, x0:x1]
    if patch.size == 0:
        return 0.0
    _, th = cv2.threshold(patch, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return float(np.mean(th > 128))


def _bubble_ring_masks(
    ph: int,
    pw: int,
    pxc: int,
    pyc: int,
    r_core: int,
    r_ring: int,
) -> tuple[np.ndarray, np.ndarray]:
    yy, xx = np.ogrid[:ph, :pw]
    d2 = (xx - pxc) ** 2 + (yy - pyc) ** 2
    m_core = d2 <= r_core * r_core
    m_ring = (d2 > r_core * r_core) & (d2 <= r_ring * r_ring)
    return m_core, m_ring


def _bubble_inner_disk_mask(
    ph: int, pw: int, pxc: int, pyc: int, r_inner: int
) -> np.ndarray:
    yy, xx = np.ogrid[:ph, :pw]
    d2 = (xx - pxc) ** 2 + (yy - pyc) ** 2
    return d2 <= r_inner * r_inner


def _apply_mask_to_bool(
    m: np.ndarray,
    mask: np.ndarray | None,
    y0: int,
    x0: int,
    ph: int,
    pw: int,
) -> np.ndarray:
    if mask is None:
        return m
    mp = mask[y0 : y0 + ph, x0 : x0 + pw]
    if mp.shape[:2] != (ph, pw):
        mp = cv2.resize(mp, (pw, ph), interpolation=cv2.INTER_NEAREST)
    return m & (mp > 127)


def _largest_ink_cc_ratio_inner(
    ink_u8: np.ndarray, m_inner: np.ndarray
) -> float:
    """Largest 8-connected ink component area inside m_inner, divided by inner pixel count."""
    if not np.any(m_inner):
        return 0.0
    masked = np.where(m_inner, ink_u8, 0).astype(np.uint8)
    n, _, stats, _ = cv2.connectedComponentsWithStats(masked, connectivity=8)
    if n <= 1:
        return 0.0
    areas = stats[1:, cv2.CC_STAT_AREA]
    largest = float(np.max(areas))
    inner_area = float(np.sum(m_inner))
    return float(largest / inner_area) if inner_area > 0 else 0.0


def _apply_mask_to_rings(
    m_core: np.ndarray,
    m_ring: np.ndarray,
    mask: np.ndarray | None,
    y0: int,
    x0: int,
    ph: int,
    pw: int,
) -> tuple[np.ndarray, np.ndarray]:
    if mask is None:
        return m_core, m_ring
    mp = mask[y0 : y0 + ph, x0 : x0 + pw]
    if mp.shape[:2] != (ph, pw):
        mp = cv2.resize(mp, (pw, ph), interpolation=cv2.INTER_NEAREST)
    ok = mp > 127
    return m_core & ok, m_ring & ok


def _localization_metric_at(
    gray: np.ndarray,
    cx: int,
    cy: int,
    r_core: int,
    r_ring: int,
    mask: np.ndarray | None,
) -> float:
    """
    Stage A — how well does (cx,cy) align with a printed bubble outline?
    Favors strong Sobel magnitude on the annulus (ink circle edge) over unstructured core gradients (text).
    """
    h, w = gray.shape[:2]
    lim = r_ring + _localize_search_half() + 2
    if cx < lim or cy < lim or cx >= w - lim or cy >= h - lim:
        return -1e9
    x0, x1 = cx - r_ring, cx + r_ring + 1
    y0, y1 = cy - r_ring, cy + r_ring + 1
    patch = gray[y0:y1, x0:x1]
    if patch.size == 0:
        return -1e9
    blur = cv2.GaussianBlur(patch, (3, 3), 0)
    gx = cv2.Sobel(blur, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(blur, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.sqrt(gx * gx + gy * gy)
    ph, pw = patch.shape[:2]
    pxc, pyc = cx - x0, cy - y0
    m_core, m_ring = _bubble_ring_masks(ph, pw, pxc, pyc, r_core, r_ring)
    m_core, m_ring = _apply_mask_to_rings(m_core, m_ring, mask, y0, x0, ph, pw)
    if not np.any(m_ring):
        return -1e9
    ring_m = float(np.mean(mag[m_ring]))
    core_m = float(np.mean(mag[m_core])) if np.any(m_core) else 0.0
    core_std = float(np.std(patch[m_core].astype(np.float32))) if np.any(m_core) else 0.0
    return float(ring_m * 1.22 - core_m * 0.42 - core_std * 0.18)


def localize_bubble_center(
    gray: np.ndarray,
    ex: int,
    ey: int,
    mask: np.ndarray | None,
    r_core: int,
    r_ring: int,
    search_half: int,
) -> tuple[int, int, float]:
    """Grid search for best ring-alignment score; returns (lx, ly, raw_metric)."""
    if not _bubble_localize_enabled():
        q = _localization_metric_at(gray, ex, ey, r_core, r_ring, mask)
        return ex, ey, float(max(q, -1e8))

    best_raw = _localization_metric_at(gray, ex, ey, r_core, r_ring, mask)
    lx, ly = ex, ey
    for dy in range(-search_half, search_half + 1):
        for dx in range(-search_half, search_half + 1):
            if dx == 0 and dy == 0:
                continue
            cx, cy = ex + dx, ey + dy
            s = _localization_metric_at(gray, cx, cy, r_core, r_ring, mask)
            if s > best_raw + 1e-6:
                best_raw = s
                lx, ly = cx, cy
    return lx, ly, float(best_raw)


def _normalize_localize_quality(raw: float) -> float:
    """Map raw ring metric to ~0..1 for debug (heuristic)."""
    if raw <= -1e8:
        return 0.0
    return float(max(0.0, min(1.0, (raw + 12.0) / 72.0)))


def _fill_evidence_at_center(
    gray: np.ndarray,
    cx: int,
    cy: int,
    r_core: int,
    r_ring: int,
    r_inner: int,
    mask: np.ndarray | None,
) -> tuple[float, float, float, float, float, float]:
    """
    Stage B — structural fill features from local Otsu ink (not contest-adjusted).

    ``inner_dark_ratio`` / ``inner_cc_ratio`` use a disk smaller than the printed ring so
    outline-heavy empty bubbles stay low; ``ring_ink_ratio`` captures outline darkness.
    """
    h, w = gray.shape[:2]
    lim = r_ring + 2
    if cx < lim or cy < lim or cx >= w - lim or cy >= h - lim:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    x0, x1 = cx - r_ring, cx + r_ring + 1
    y0, y1 = cy - r_ring, cy + r_ring + 1
    patch = gray[y0:y1, x0:x1]
    if patch.size == 0:
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    ph, pw = patch.shape[:2]
    pxc, pyc = cx - x0, cy - y0
    m_core, m_ring = _bubble_ring_masks(ph, pw, pxc, pyc, r_core, r_ring)
    m_core, m_ring = _apply_mask_to_rings(m_core, m_ring, mask, y0, x0, ph, pw)
    m_inner = _bubble_inner_disk_mask(ph, pw, pxc, pyc, r_inner)
    m_inner = _apply_mask_to_bool(m_inner, mask, y0, x0, ph, pw)
    if not np.any(m_inner):
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0

    _, th = cv2.threshold(patch, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink = (th > 128).astype(np.uint8) * 255

    inner_r = float(np.mean(ink[m_inner] > 127))
    ring_r = float(np.mean(ink[m_ring] > 127)) if np.any(m_ring) else 0.0
    g_inner = patch[m_inner].astype(np.float32)
    core_mean_dark = float(max(0.0, min(1.0, 1.0 - float(np.mean(g_inner)) / 255.0)))
    cc_r = _largest_ink_cc_ratio_inner(ink, m_inner)
    delta = float(ring_r - inner_r)

    # Ring-dominated empty bubble: dark annulus, light interior
    ring_dom = max(0.0, delta - 0.05)
    raw = (
        0.48 * inner_r
        + 0.34 * cc_r
        + 0.18 * core_mean_dark
        - 0.52 * ring_dom
    )
    if ring_r > 0.20 and inner_r < 0.17:
        raw -= 0.14
    if inner_r < 0.11 and cc_r < 0.12:
        raw = min(raw, 0.04)
    if cc_r < 0.09 and inner_r < 0.22:
        raw -= 0.08
    raw = float(max(0.0, min(1.0, raw)))
    return raw, inner_r, ring_r, core_mean_dark, cc_r, delta


def _fill_score_micro_refine(
    gray: np.ndarray,
    lx: int,
    ly: int,
    r_core: int,
    r_ring: int,
    r_inner: int,
    mask: np.ndarray | None,
) -> tuple[float, int, int, float, float, float, float, float, float]:
    """±REFINE_MAX_PX search maximizing pre-contest ``fill_score_raw`` only."""
    (
        best_raw,
        bd_in,
        bd_ring,
        bd_cmd,
        bd_cc,
        bd_delta,
    ) = _fill_evidence_at_center(gray, lx, ly, r_core, r_ring, r_inner, mask)
    bx, by = lx, ly
    for dy in range(-REFINE_MAX_PX, REFINE_MAX_PX + 1):
        for dx in range(-REFINE_MAX_PX, REFINE_MAX_PX + 1):
            if dx == 0 and dy == 0:
                continue
            s, ir, rr, cmd, cc, dlt = _fill_evidence_at_center(
                gray, lx + dx, ly + dy, r_core, r_ring, r_inner, mask
            )
            if s > best_raw + 1e-6:
                best_raw = s
                bx, by = lx + dx, ly + dy
                bd_in, bd_ring, bd_cmd, bd_cc, bd_delta = ir, rr, cmd, cc, dlt
    return (
        max(0.0, best_raw),
        bx,
        by,
        bd_in,
        bd_ring,
        bd_cmd,
        bd_cc,
        bd_delta,
    )


def score_bubble_fixed_roi(
    gray: np.ndarray,
    ex: int,
    ey: int,
    r_core: int = BUBBLE_R_CORE,
    r_ring: int = BUBBLE_R_RING,
    mask: np.ndarray | None = None,
) -> BubbleRoiScore:
    """
    Two-phase bubble read: (A) localize printed circle from template guess ``(ex,ey)``,
    (B) classify fill at localized center with a tiny fill-only offset search.
    """
    sh = _localize_search_half()
    lx, ly, loc_raw = localize_bubble_center(gray, ex, ey, mask, r_core, r_ring, sh)
    loc_q = _normalize_localize_quality(loc_raw)
    (
        fill_raw,
        ev_x,
        ev_y,
        inner_r,
        ring_r,
        cmd,
        cc_r,
        delta,
    ) = _fill_score_micro_refine(
        gray, lx, ly, r_core, r_ring, BUBBLE_R_INNER, mask
    )
    return BubbleRoiScore(
        fill_score=fill_raw,
        expected_cx=ex,
        expected_cy=ey,
        localized_cx=lx,
        localized_cy=ly,
        evaluated_cx=ev_x,
        evaluated_cy=ev_y,
        localize_quality=loc_q,
        localize_raw=loc_raw,
        inner_dark_ratio=inner_r,
        ring_ink_ratio=ring_r,
        core_mean_dark=cmd,
        inner_cc_ratio=cc_r,
        fill_score_raw=fill_raw,
        ring_core_delta=delta,
    )


def refine_bubble_fill(
    gray: np.ndarray,
    nx: float,
    ny: float,
    tol: int = SEARCH_TOL_PX,
    mask: np.ndarray | None = None,
) -> BubbleRoiScore:
    """Normalized center (nx,ny) in warped image [0,1]² → full localize + fill pipeline."""
    _ = tol
    Hh, Ww = gray.shape[:2]
    cx0 = int(round(max(0, min(Ww - 1, nx * Ww))))
    cy0 = int(round(max(0, min(Hh - 1, ny * Hh))))
    return score_bubble_fixed_roi(gray, cx0, cy0, mask=mask)


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
    floor = FILL_THRESHOLD
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


def _option_is_abstain_oid(oid: str) -> bool:
    return str(oid).strip().lower().startswith("abstain")


def fill_hard_gate_failures(r: BubbleRoiScore) -> list[str]:
    """Non-empty list ⇒ bubble is treated as empty before any score thresholding."""
    fails: list[str] = []
    if r.inner_dark_ratio < HARD_INNER_DARK_MIN:
        fails.append("inner_dark_ratio_lt_0.4")
    if r.inner_cc_ratio < HARD_INNER_CC_MIN:
        fails.append("inner_cc_ratio_lt_0.3")
    if r.core_mean_dark < HARD_CORE_MEAN_DARK_MIN:
        fails.append("core_mean_dark_low")
    if r.ring_ink_ratio > r.inner_dark_ratio + HARD_RING_INNER_MARGIN:
        fails.append("ring_dominant")
    return fails


def bubble_likely_empty_for_calibration(r: BubbleRoiScore) -> bool:
    """
    Conservative pool for ballot-level empty reference: quiet interior + visible ring outline.
    Fails hard-gate “mark” shapes (high inner / CC / fill); includes typical unfilled OMR circles.
    """
    if r.inner_dark_ratio >= LIKELY_EMPTY_INNER_MAX:
        return False
    if r.inner_cc_ratio >= LIKELY_EMPTY_CC_MAX:
        return False
    if r.fill_score_raw >= LIKELY_EMPTY_SCORE_MAX:
        return False
    if r.core_mean_dark >= LIKELY_EMPTY_CORE_MAX:
        return False
    ring_heavy = r.ring_ink_ratio > r.inner_dark_ratio + LIKELY_EMPTY_RING_OVER_INNER_MIN
    return ring_heavy


def build_ballot_empty_reference(all_rois: dict[str, BubbleRoiScore]) -> dict[str, Any]:
    """
    Median metrics over likely-empty bubbles; fallback to lowest ``BALLOT_EMPTY_FALLBACK_FRAC``
    by emptiness index if the strict pool is too small. ``skipped`` if fewer than 2 bubbles total.
    """
    n_tot = len(all_rois)
    if n_tot < 2:
        return {
            "emptyRefInner": 0.0,
            "emptyRefCc": 0.0,
            "emptyRefCore": 0.0,
            "emptyRefScore": 0.0,
            "emptySampleCount": 0,
            "emptyMadInner": 0.0,
            "emptyMadCc": 0.0,
            "calibrationMethod": "skipped",
            "skipped": True,
        }
    strict_pool = [r for r in all_rois.values() if bubble_likely_empty_for_calibration(r)]
    method = "likely_empty_median"
    pool_rois = strict_pool
    if len(pool_rois) < MIN_BALLOT_EMPTY_SAMPLES:
        method = f"fallback_low_frac_{int(BALLOT_EMPTY_FALLBACK_FRAC * 100)}"
        indexed = sorted(
            all_rois.items(),
            key=lambda kv: (
                kv[1].inner_dark_ratio
                + kv[1].inner_cc_ratio
                + kv[1].fill_score_raw
                + kv[1].core_mean_dark
            ),
        )
        k = max(MIN_BALLOT_EMPTY_SAMPLES, int(np.ceil(n_tot * BALLOT_EMPTY_FALLBACK_FRAC)))
        k = min(n_tot, max(2, k))
        pool_rois = [r for _oid, r in indexed[:k]]
    inners = np.array([r.inner_dark_ratio for r in pool_rois], dtype=np.float64)
    ccs = np.array([r.inner_cc_ratio for r in pool_rois], dtype=np.float64)
    cores = np.array([r.core_mean_dark for r in pool_rois], dtype=np.float64)
    scores = np.array([r.fill_score_raw for r in pool_rois], dtype=np.float64)
    med_i = float(np.median(inners))
    med_c = float(np.median(ccs))
    med_co = float(np.median(cores))
    med_s = float(np.median(scores))

    def _mad(a: np.ndarray, med: float) -> float:
        return float(np.median(np.abs(a - med))) if a.size else 0.0

    return {
        "emptyRefInner": med_i,
        "emptyRefCc": med_c,
        "emptyRefCore": med_co,
        "emptyRefScore": med_s,
        "emptySampleCount": len(pool_rois),
        "emptyMadInner": _mad(inners, med_i),
        "emptyMadCc": _mad(ccs, med_c),
        "calibrationMethod": method,
        "skipped": False,
        "strictLikelyEmptyCount": len(strict_pool),
    }


def evaluate_ballot_level_calibration(
    r: BubbleRoiScore,
    ballot_ref: dict[str, Any],
    hard_pass: bool,
) -> tuple[bool, list[str], dict[str, float]]:
    """After hard gates: require lift over ballot-wide empty profile (skipped if ref skipped)."""
    ex_i = float(r.inner_dark_ratio - ballot_ref["emptyRefInner"])
    ex_c = float(r.inner_cc_ratio - ballot_ref["emptyRefCc"])
    ex_co = float(r.core_mean_dark - ballot_ref["emptyRefCore"])
    ex_s = float(r.fill_score_raw - ballot_ref["emptyRefScore"])
    excesses: dict[str, float] = {
        "ballotInnerExcess": ex_i,
        "ballotCcExcess": ex_c,
        "ballotCoreExcess": ex_co,
        "ballotScoreExcess": ex_s,
    }
    if not hard_pass:
        return False, [], excesses
    if ballot_ref.get("skipped"):
        return True, [], excesses
    fails: list[str] = []
    if ex_i < BALLOT_DOMINANCE_DELTA_INNER:
        fails.append("ballot_inner_vs_empty_low")
    if ex_c < BALLOT_DOMINANCE_DELTA_CC:
        fails.append("ballot_cc_vs_empty_low")
    if ex_co < BALLOT_DOMINANCE_DELTA_CORE:
        fails.append("ballot_core_vs_empty_low")
    if ex_s < BALLOT_DOMINANCE_DELTA_SCORE:
        fails.append("ballot_score_vs_empty_low")
    return (len(fails) == 0), fails, excesses


def contest_fill_scores_after_hard_gates(rois: dict[str, BubbleRoiScore]) -> dict[str, float]:
    """
    After hard gates, final contest score is ``fill_score_raw`` for passers only (no baseline boost).
    Failures are forced to 0.0 regardless of raw score.
    """
    out: dict[str, float] = {}
    for oid, r in rois.items():
        if fill_hard_gate_failures(r):
            out[oid] = 0.0
        else:
            out[oid] = float(max(0.0, min(1.0, r.fill_score_raw)))
    return out


def compute_contest_blank_baseline(rois: dict[str, BubbleRoiScore]) -> dict[str, float]:
    """
    Local empty-bubble profile: lower-ish percentile of each metric across **all** options
    in the contest (empties cluster low; lighting shifts the whole cluster together).
    """
    if not rois:
        return {
            "blankRefInner": 0.0,
            "blankRefCc": 0.0,
            "blankRefCore": 0.0,
            "blankRefScore": 0.0,
        }
    inners = np.array([r.inner_dark_ratio for r in rois.values()], dtype=np.float64)
    ccs = np.array([r.inner_cc_ratio for r in rois.values()], dtype=np.float64)
    cores = np.array([r.core_mean_dark for r in rois.values()], dtype=np.float64)
    raw_scores = np.array([r.fill_score_raw for r in rois.values()], dtype=np.float64)
    p = float(CONTEST_BLANK_PERCENTILE)
    return {
        "blankRefInner": float(np.percentile(inners, p)),
        "blankRefCc": float(np.percentile(ccs, p)),
        "blankRefCore": float(np.percentile(cores, p)),
        "blankRefScore": float(np.percentile(raw_scores, p)),
    }


def evaluate_bubble_contest_dominance(
    r: BubbleRoiScore,
    baseline: dict[str, float],
    hard_pass: bool,
    contest_size: int,
) -> tuple[bool, list[str], dict[str, float]]:
    """
    After hard gates: require clear lift over contest blank profile (skipped for single-option).
    Returns (pass, failure_codes, excesses for debug).
    """
    ex_i = float(r.inner_dark_ratio - baseline["blankRefInner"])
    ex_c = float(r.inner_cc_ratio - baseline["blankRefCc"])
    ex_co = float(r.core_mean_dark - baseline["blankRefCore"])
    ex_s = float(r.fill_score_raw - baseline["blankRefScore"])
    excesses = {
        "innerDarkExcess": ex_i,
        "innerCcExcess": ex_c,
        "coreDarkExcess": ex_co,
        "scoreExcess": ex_s,
    }
    if not hard_pass:
        return False, [], excesses
    if contest_size < 2:
        return True, [], excesses
    fails: list[str] = []
    if ex_i < DOMINANCE_DELTA_INNER:
        fails.append("inner_vs_blank_low")
    if ex_c < DOMINANCE_DELTA_CC:
        fails.append("cc_vs_blank_low")
    if ex_co < DOMINANCE_DELTA_CORE:
        fails.append("core_vs_blank_low")
    if ex_s < DOMINANCE_DELTA_SCORE:
        fails.append("score_vs_blank_low")
    return (len(fails) == 0), fails, excesses


def contest_scores_with_dominance(
    rois: dict[str, BubbleRoiScore],
    ballot_ref: dict[str, Any],
    ballot_dom_detail: dict[str, tuple[bool, list[str], dict[str, float]]],
) -> tuple[
    dict[str, float],
    dict[str, bool],
    dict[str, bool],
    dict[str, bool],
    dict[str, float],
    dict[str, tuple[bool, list[str], dict[str, float]]],
    dict[str, list[str]],
]:
    """
    Hard gates → ballot-level calibration (``ballot_dom_detail`` precomputed) → contest blank
    baseline → contest dominance → scores (0 if any stage fails).
    ``selection_eligible`` = hard ∧ ballot_cal ∧ contest_dom (used for threshold / winner margin).
    """
    gate_fail = {oid: fill_hard_gate_failures(r) for oid, r in rois.items()}
    hard_ok = {oid: len(gate_fail[oid]) == 0 for oid in rois}
    baseline = compute_contest_blank_baseline(rois)
    n = len(rois)
    dom_detail: dict[str, tuple[bool, list[str], dict[str, float]]] = {}
    contest_dom_ok: dict[str, bool] = {}
    scores: dict[str, float] = {}
    for oid, r in rois.items():
        b_ok, _, _ = ballot_dom_detail[oid]
        c_ok, c_fails, c_ex = evaluate_bubble_contest_dominance(r, baseline, hard_ok[oid], n)
        dom_detail[oid] = (c_ok, c_fails, c_ex)
        contest_dom_ok[oid] = c_ok
        if hard_ok[oid] and b_ok and c_ok:
            scores[oid] = float(max(0.0, min(1.0, r.fill_score_raw)))
        else:
            scores[oid] = 0.0
    eligible = {
        oid: hard_ok[oid] and ballot_dom_detail[oid][0] and contest_dom_ok[oid] for oid in rois
    }
    return scores, eligible, hard_ok, contest_dom_ok, baseline, dom_detail, gate_fail


def bubble_fill_class_v2(
    oid: str,
    picks: list[str],
    score: float,
    hard_pass: bool,
    gate_fails: list[str],
    ballot_dominance_ok: bool,
    contest_dominance_ok: bool,
    winner_margin_ok: bool,
    abstain_conflict: bool = False,
) -> str:
    """Per-bubble label after gates, ballot calibration, contest dominance, threshold, winner-margin."""
    if not hard_pass:
        return "empty"
    if hard_pass and not ballot_dominance_ok:
        return "empty"
    if hard_pass and not contest_dominance_ok:
        return "empty"
    if abstain_conflict:
        return "empty"
    if not winner_margin_ok:
        return "ambiguous"
    if oid in picks:
        return "filled"
    if score >= AMBIGUOUS_SCORE_HIGH:
        return "ambiguous"
    return "empty"


def select_marks_strict_overvote(
    scores: dict[str, float],
    max_votes: int,
    threshold: float,
    *,
    hard_pass: dict[str, bool] | None = None,
) -> tuple[list[str], dict[str, Any]]:
    """
    Among options with ``hard_pass`` and score >= ``threshold``, take up to ``max_votes`` highest.
    Requires the weakest selected score to exceed the best non-selected score by
    ``WINNER_SEPARATION_MARGIN`` (skipped for single-option contests). Abstain conflict clears picks.
    """
    if not scores or max_votes < 1:
        return [], {
            "confidence": 0.0,
            "overvote": False,
            "abstainConflict": False,
            "marksAboveThreshold": 0,
            "winnerMarginFailed": False,
        }
    hp = hard_pass if hard_pass is not None else {o: True for o in scores}
    ordered = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    vals = [v for _, v in ordered]
    med = float(np.median(vals))
    top = float(ordered[0][1])
    second = float(ordered[1][1]) if len(ordered) > 1 else 0.0

    eligible = [(o, s) for o, s in ordered if hp.get(o, False) and s >= threshold]
    marks_above = len(eligible)

    meta: dict[str, Any] = {
        "confidence": min(1.0, max(0.0, (top - med) * 2.0 + (top - second) * 0.5)),
        "overvote": False,
        "abstainConflict": False,
        "marksAboveThreshold": marks_above,
        "winnerMarginFailed": False,
    }

    picks = [o for o, _ in eligible[:max_votes]]

    if picks and len(scores) > 1:
        min_sel = min(scores[o] for o in picks)
        best_rest = 0.0
        for o, s in ordered:
            if o not in picks:
                best_rest = float(s)
                break
        if min_sel - best_rest < WINNER_SEPARATION_MARGIN:
            picks = []
            meta["winnerMarginFailed"] = True
            meta["confidence"] = 0.0

    has_abs = any(_option_is_abstain_oid(x) for x in picks)
    has_cand = any(not _option_is_abstain_oid(x) for x in picks)
    if has_abs and has_cand:
        picks = []
        meta["abstainConflict"] = True
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

    gray, gray_meta = prepare_bubble_scoring_gray(warped)
    Hh, Ww = gray.shape[:2]
    score_mask = build_bubble_scoring_mask(Hh, Ww)
    geom = template.get("geometry")
    page = (geom.get("page") if isinstance(geom, dict) else None) or {}
    if not page:
        page = template.get("page") or {}
    page_w = float(page.get("width") or CANONICAL_W)
    page_h = float(page.get("height") or CANONICAL_H)
    raw_scores: dict[str, dict[str, float]] = {}
    selections: dict[str, list[str]] = {}
    contest_confs: list[float] = []
    layout_debug: list[dict[str, Any]] = []
    contests_read: list[dict[str, Any]] = []

    spec_by_pid = {
        str(c.get("positionId") or ""): c
        for c in (template.get("contests") or [])
        if c.get("positionId")
    }

    flat_rois: dict[str, BubbleRoiScore] = {}
    for contest in contests:
        cid0 = str(contest["id"])
        for b in contest.get("bubbles") or []:
            oid0 = str(b["optionId"])
            bx = float(b.get("x") or 0.0)
            by = float(b.get("y") or 0.0)
            bw = float(b.get("w") or 0.0)
            bh = float(b.get("h") or 0.0)
            if bw > 1e-9 or bh > 1e-9:
                cx_p = bx + bw / 2.0
                cy_p = by + bh / 2.0
                if abs(page_w - 1.0) < 0.01:
                    nx0, ny0 = cx_p, cy_p
                else:
                    nx0, ny0 = cx_p / page_w, cy_p / page_h
            else:
                nx0 = max(0.0, min(1.0, float(bx)))
                ny0 = max(0.0, min(1.0, float(by)))
            nx0 = max(0.0, min(1.0, nx0))
            ny0 = max(0.0, min(1.0, ny0))
            roi0 = refine_bubble_fill(gray, nx0, ny0, mask=score_mask)
            flat_rois[f"{cid0}::{oid0}"] = roi0

    ballot_ref = build_ballot_empty_reference(flat_rois)
    ballot_dom_global: dict[str, tuple[bool, list[str], dict[str, float]]] = {}
    for k, r0 in flat_rois.items():
        hp0 = len(fill_hard_gate_failures(r0)) == 0
        ballot_dom_global[k] = evaluate_ballot_level_calibration(r0, ballot_ref, hp0)

    for contest in contests:
        cid = str(contest["id"])
        spec = spec_by_pid.get(cid) or {}
        max_v = int(contest.get("maxVotes") or spec.get("maxMarks") or 1)
        bubble_rows: list[tuple[str, float, float, BubbleRoiScore]] = []

        for b in contest.get("bubbles") or []:
            oid = str(b["optionId"])

            bx = float(b.get("x") or 0.0)
            by = float(b.get("y") or 0.0)
            bw = float(b.get("w") or 0.0)
            bh = float(b.get("h") or 0.0)

            if bw > 1e-9 or bh > 1e-9:
                cx_p = bx + bw / 2.0
                cy_p = by + bh / 2.0
                if abs(page_w - 1.0) < 0.01:
                    nx = cx_p
                    ny = cy_p
                else:
                    nx = cx_p / page_w
                    ny = cy_p / page_h
            else:
                nx = max(0.0, min(1.0, float(bx)))
                ny = max(0.0, min(1.0, float(by)))

            nx = max(0.0, min(1.0, nx))
            ny = max(0.0, min(1.0, ny))

            roi = flat_rois[f"{cid}::{oid}"]
            bubble_rows.append((oid, nx, ny, roi))

        rois_map = {oid: r for oid, _, _, r in bubble_rows}
        ballot_dom_slice = {
            oid: ballot_dom_global[f"{cid}::{oid}"] for oid in rois_map
        }
        (
            scores,
            sel_eligible,
            hard_ok,
            contest_dom_ok,
            baseline,
            dom_detail,
            gate_fail,
        ) = contest_scores_with_dominance(rois_map, ballot_ref, ballot_dom_slice)
        picks, meta = select_marks_strict_overvote(
            scores,
            max_v,
            STRICT_BUBBLE_MARK_THRESHOLD,
            hard_pass=sel_eligible,
        )
        margin_ok = not bool(meta.get("winnerMarginFailed"))
        abst_bad = bool(meta.get("abstainConflict"))
        selections[cid] = picks

        for oid, nx, ny, roi in bubble_rows:
            adj = scores[oid]
            fails = gate_fail[oid]
            cdom_pass, cdom_fails, exc = dom_detail[oid]
            bcal_pass, bcal_fails, bcal_ex = ballot_dom_slice[oid]
            cls = bubble_fill_class_v2(
                oid,
                picks,
                adj,
                hard_ok[oid],
                fails,
                bcal_pass,
                cdom_pass,
                margin_ok,
                abstain_conflict=abst_bad,
            )
            layout_debug.append(
                {
                    "contestId": cid,
                    "optionId": oid,
                    "nx": nx,
                    "ny": ny,
                    "expected_px": [roi.expected_cx, roi.expected_cy],
                    "localized_px": [roi.localized_cx, roi.localized_cy],
                    "refined_px": [roi.evaluated_cx, roi.evaluated_cy],
                    "localizeQuality": roi.localize_quality,
                    "localizeRaw": roi.localize_raw,
                    "fillRatio": adj,
                    "fillRatioRaw": roi.fill_score_raw,
                    "innerDarkRatio": roi.inner_dark_ratio,
                    "ringInkRatio": roi.ring_ink_ratio,
                    "coreMeanDark": roi.core_mean_dark,
                    "innerCcRatio": roi.inner_cc_ratio,
                    "ringCoreDelta": roi.ring_core_delta,
                    "fillHardPass": hard_ok[oid],
                    "fillHardFailures": fails,
                    "ballotEmptyRefInner": ballot_ref["emptyRefInner"],
                    "ballotEmptyRefCc": ballot_ref["emptyRefCc"],
                    "ballotEmptyRefCore": ballot_ref["emptyRefCore"],
                    "ballotEmptyRefScore": ballot_ref["emptyRefScore"],
                    "ballotInnerExcess": bcal_ex["ballotInnerExcess"],
                    "ballotCcExcess": bcal_ex["ballotCcExcess"],
                    "ballotCoreExcess": bcal_ex["ballotCoreExcess"],
                    "ballotScoreExcess": bcal_ex["ballotScoreExcess"],
                    "fillBallotCalibrationPass": bcal_pass,
                    "fillBallotCalibrationFailures": bcal_fails,
                    "contestBlankRefInner": baseline["blankRefInner"],
                    "contestBlankRefCc": baseline["blankRefCc"],
                    "contestBlankRefCore": baseline["blankRefCore"],
                    "contestBlankRefScore": baseline["blankRefScore"],
                    "innerDarkExcess": exc["innerDarkExcess"],
                    "innerCcExcess": exc["innerCcExcess"],
                    "coreDarkExcess": exc["coreDarkExcess"],
                    "scoreExcess": exc["scoreExcess"],
                    "fillDominancePass": cdom_pass,
                    "fillDominanceFailures": cdom_fails,
                    "contestWinnerMarginOk": margin_ok and not abst_bad,
                    "contestAbstainConflict": abst_bad,
                    "fillClassification": cls,
                }
            )
        raw_scores[cid] = scores
        conf_c = float(meta.get("confidence") or 0.0)
        if (
            meta.get("overvote")
            or meta.get("abstainConflict")
            or meta.get("winnerMarginFailed")
        ):
            conf_c = 0.0
        contest_confs.append(conf_c)
        pick0 = picks[0] if picks else None
        sel_excess = None
        if pick0 is not None and pick0 in dom_detail:
            _, _, ex0 = dom_detail[pick0]
            sel_excess = dict(ex0)
        sel_ballot_excess = None
        if pick0 is not None and pick0 in ballot_dom_slice:
            _, _, bx0 = ballot_dom_slice[pick0]
            sel_ballot_excess = dict(bx0)
        contests_read.append(
            {
                "positionId": cid,
                "maxVotes": max_v,
                "selectedOptionIds": picks,
                "overvote": bool(meta.get("overvote")),
                "abstainConflict": bool(meta.get("abstainConflict")),
                "marksAboveThreshold": int(meta.get("marksAboveThreshold") or 0),
                "winnerMarginFailed": bool(meta.get("winnerMarginFailed")),
                "ballotEmptyCalibration": ballot_ref,
                "ballotDominanceDeltasRequired": {
                    "inner": BALLOT_DOMINANCE_DELTA_INNER,
                    "cc": BALLOT_DOMINANCE_DELTA_CC,
                    "core": BALLOT_DOMINANCE_DELTA_CORE,
                    "score": BALLOT_DOMINANCE_DELTA_SCORE,
                },
                "selectedBallotCalibrationExcess": sel_ballot_excess,
                "blankBaseline": baseline,
                "blankPercentile": CONTEST_BLANK_PERCENTILE,
                "dominanceDeltasRequired": {
                    "inner": DOMINANCE_DELTA_INNER,
                    "cc": DOMINANCE_DELTA_CC,
                    "core": DOMINANCE_DELTA_CORE,
                    "score": DOMINANCE_DELTA_SCORE,
                },
                "selectedDominanceExcess": sel_excess,
            }
        )

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
            "contestsRead": contests_read,
            "bubbleScoringMaskApplied": True,
            "grayPreprocess": gray_meta,
            "ballotEmptyCalibration": ballot_ref,
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
        ev_x, ev_y = int(row["refined_px"][0]), int(row["refined_px"][1])
        ex, ey = ev_x, ev_y
        if "expected_px" in row:
            ex, ey = int(row["expected_px"][0]), int(row["expected_px"][1])
            cv2.circle(canvas, (ex, ey), 4, (255, 0, 0), 1)  # blue = expected (BGR)
        lx, ly = ex, ey
        if "localized_px" in row:
            lx, ly = int(row["localized_px"][0]), int(row["localized_px"][1])
            if (lx, ly) != (ex, ey):
                cv2.circle(canvas, (lx, ly), 5, (255, 0, 255), 1)  # magenta = localized
                cv2.line(canvas, (ex, ey), (lx, ly), (0, 255, 255), 1)  # yellow exp→loc
        if (ev_x, ev_y) != (lx, ly):
            cv2.line(canvas, (lx, ly), (ev_x, ev_y), (200, 200, 200), 1)  # gray loc→fill
        oid = str(row.get("optionId") or "")
        fr = float(row.get("fillRatio") or 0.0)
        lq = float(row.get("localizeQuality") or 0.0)
        cls = str(row.get("fillClassification") or "")
        ir = float(row.get("innerDarkRatio") or 0.0)
        rr = float(row.get("ringInkRatio") or 0.0)
        ccv = float(row.get("innerCcRatio") or 0.0)
        tag = {"filled": "F", "ambiguous": "A", "empty": "E"}.get(cls, "?")
        thr = STRICT_BUBBLE_MARK_THRESHOLD
        if oid in picked_flat:
            col = (0, 255, 0)
        elif cls == "ambiguous":
            col = (0, 140, 255)
        elif fr >= thr * 0.82:
            col = (0, 200, 255)
        else:
            col = (60, 60, 255)
        cv2.circle(canvas, (ev_x, ev_y), 10, col, 2)
        hp = row.get("fillHardPass")
        gate_ch = "G" if hp is True else ("!" if hp is False else "?")
        b_ok = row.get("fillBallotCalibrationPass")
        b_ch = "B" if b_ok is True else ("b" if b_ok is False else "?")
        dom_ok = row.get("fillDominancePass")
        dom_ch = "D" if dom_ok is True else ("x" if dom_ok is False else "?")
        m_ok = row.get("contestWinnerMarginOk")
        m_ch = "M" if m_ok is True else ("m" if m_ok is False else "?")
        cv2.putText(
            canvas,
            f"{gate_ch}{b_ch}{dom_ch}{m_ch}{tag} {fr:.2f} i{ir:.2f}k{ccv:.2f}r{rr:.2f}",
            (min(W - 130, ev_x + 8), min(H - 4, ev_y + 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.24,
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
