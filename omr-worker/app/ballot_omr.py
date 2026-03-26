"""
eCASVote paper ballot OMR — OpenCV pipeline aligned with PrintableBallotSheet (OMR v2):
- 8 edge fiducials + timing strips; contests stacked vertically (full width).
- Each contest: row-major 3-column candidate grid ([#][bubble][name] per cell).
- QR in footer (below scan frame); top-right crops kept for legacy scans.

Open MCR (https://github.com/iansan5653/open-mcr) uses fixed 75/150-question PDFs;
this worker reads *our* layout using the exported ecasvote-scanner-template/1 JSON.

ExamGrader (https://sites.google.com/site/examgrader/downloads) is a separate desktop
tool — use offline if preferred; this service replaces in-app scanning.
"""

from __future__ import annotations

import base64
import json
from typing import Any

import cv2
import numpy as np

from app.ml_correction import bubble_ml_corrector
from app.ballot_template_v2 import (
    BUBBLE_SPEC,
    LAYOUT_SPEC,
    TIMING_SPEC,
    expected_edge_mark_positions,
)

TEMPLATE_LAYOUT_PROFILES: dict[str, dict[str, Any]] = {
    # v2: 3-column row-major contest cells.
    "v2": {
        "contests_y0": LAYOUT_SPEC.contests_y0,
        "contests_y1": LAYOUT_SPEC.contests_y1,
        "weight_mode": "rows_3col",
        "num_cols": 3,
        "bubble_lane": None,
        "bubble_center": (None, None),
    },
    # v3/v4: single-column rows with local anchors/rails.
    "v3": {
        "contests_y0": 0.24,
        "contests_y1": 0.90,
        "weight_mode": "rows_single",
        "num_cols": 1,
        "bubble_lane": (0.72, 0.96),
        "bubble_center": (0.52, 0.50),
    },
    "v4": {
        "contests_y0": 0.24,
        "contests_y1": 0.905,
        "weight_mode": "rows_single",
        "num_cols": 1,
        "bubble_lane": (0.73, 0.96),
        "bubble_center": (0.52, 0.50),
    },
}

# Legacy v1/v2 3-column print geometry on A4 (Netum SD-800NC captures).
# Slightly wider side rails and a more left-shifted bubble center align expected
# circle probes to the physically printed bubble position.
LEGACY_SIDE_MARGIN_RATIO = 0.082
LEGACY_BUBBLE_CENTER_X = 0.16
CONTEST_HEADER_SKIP_PX = 38
ROW_HEIGHT_PX = 20

def decode_image_b64(image_b64: str) -> np.ndarray:
    raw = base64.b64decode(image_b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    im = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if im is None:
        raise ValueError("Could not decode image bytes")
    return im


def _parse_ballot_qr_json(raw: str) -> tuple[dict[str, Any] | None, str | None]:
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None, raw
    if not isinstance(obj, dict):
        return None, raw
    if not all(
        k in obj and isinstance(obj[k], str)
        for k in ("electionId", "ballotToken", "templateVersion")
    ):
        return None, raw
    return obj, raw


def decode_qr_ballot(img: np.ndarray) -> tuple[dict[str, Any] | None, str | None]:
    """Try several scales / contrast — phone photos and FB thumbnails often fail on a single pass."""
    det = cv2.QRCodeDetector()
    variants: list[np.ndarray] = [img]
    h, w = img.shape[:2]
    m = max(h, w)

    if m > 2000:
        s = 1800 / m
        variants.append(
            cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        )
    if m < 900:
        s = 1400 / m
        variants.append(
            cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_CUBIC)
        )

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    eq = cv2.equalizeHist(gray)
    variants.append(cv2.cvtColor(eq, cv2.COLOR_GRAY2BGR))
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    variants.append(cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR))

    def _decode_variant(v: np.ndarray) -> tuple[dict[str, Any] | None, str | None]:
        data, _pts, _straight = det.detectAndDecode(v)
        if not data or not data.strip():
            return None, None
        raw = data.strip()
        parsed, _ = _parse_ballot_qr_json(raw)
        return parsed, raw

    last_raw: str | None = None
    for v in variants:
        parsed, raw = _decode_variant(v)
        if raw:
            last_raw = raw
        if parsed is not None:
            return parsed, raw

        # Legacy: QR top-right of header.
        vh, vw = v.shape[:2]
        top_right_crops = [
            v[0 : int(vh * 0.35), int(vw * 0.7) : vw],
            v[0 : int(vh * 0.45), int(vw * 0.6) : vw],
            v[0 : int(vh * 0.55), int(vw * 0.55) : vw],
        ]
        # Current sheet: QR in footer band (bottom-right).
        bottom_right_crops = [
            v[int(vh * 0.58) : vh, int(vw * 0.52) : vw],
            v[int(vh * 0.62) : vh, int(vw * 0.48) : vw],
            v[int(vh * 0.55) : vh, int(vw * 0.55) : vw],
            v[int(vh * 0.68) : vh, int(vw * 0.45) : vw],
        ]
        for c in top_right_crops + bottom_right_crops:
            if c.size == 0:
                continue
            c2 = cv2.resize(c, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            for probe in (
                c2,
                cv2.cvtColor(cv2.equalizeHist(cv2.cvtColor(c2, cv2.COLOR_BGR2GRAY)), cv2.COLOR_GRAY2BGR),
            ):
                parsed_c, raw_c = _decode_variant(probe)
                if raw_c:
                    last_raw = raw_c
                if parsed_c is not None:
                    return parsed_c, raw_c

    return None, last_raw


def _detect_contest_top_edges(body_gray: np.ndarray, n_expected: int) -> list[int] | None:
    """
    Detect y-positions where each contest block starts by finding the horizontal
    black border lines that PrintableBallotSheet draws around each contest article.

    Each contest is wrapped in <article class="border border-neutral-400 print:border-black">.
    In the warped body image these show up as rows where >50 % of pixels are dark.

    Returns a sorted list of y-start positions (length == n_expected), or None if
    detection cannot find exactly n_expected blocks.
    """
    h, w = body_gray.shape
    if h < 20 or w < 20:
        return None

    _, inv = cv2.threshold(body_gray, 160, 255, cv2.THRESH_BINARY_INV)
    # Sum dark pixels per row; ignore outer side margins (timing strips)
    margin = int(w * 0.05)
    row_dark = np.sum(inv[:, margin : w - margin] > 128, axis=1)
    inner_w = w - 2 * margin

    # A full-width contest border: ≥55 % of inner width is dark in a thin run.
    threshold = inner_w * 0.55
    border_mask = (row_dark >= threshold).astype(np.uint8)

    # Merge adjacent border rows into single events.
    edges: list[int] = []
    in_band = False
    band_start = 0
    for y in range(h):
        if border_mask[y] and not in_band:
            in_band = True
            band_start = y
        elif not border_mask[y] and in_band:
            in_band = False
            edges.append((band_start + y) // 2)  # midpoint of border band
    if in_band:
        edges.append((band_start + h) // 2)

    # Each contest has a top border; we also get interior dividers (section-bar bottom).
    # Keep only edges spaced far enough apart to be top-of-contest borders.
    min_gap = int(h / (n_expected * 3))  # at least 1/3 of expected strip height
    filtered: list[int] = []
    last = -min_gap * 2
    for e in edges:
        if e - last >= min_gap:
            filtered.append(e)
            last = e

    if len(filtered) == n_expected:
        return filtered

    # Tolerate ±1 extra edge (interior section-bar divider or slight noise).
    if len(filtered) == n_expected + 1:
        # Drop the extra that is closest to its neighbour.
        best_drop = 0
        best_gap = filtered[1] - filtered[0]
        for i in range(1, len(filtered) - 1):
            gap = filtered[i + 1] - filtered[i - 1]
            if gap < best_gap:
                best_gap = gap
                best_drop = i
        filtered.pop(best_drop)
        if len(filtered) == n_expected:
            return filtered

    return None


def _looks_like_printed_contest(strip_bgr: np.ndarray) -> bool:
    """
    Heuristic: determine whether a detected strip likely contains a rendered contest
    (border + text rows), vs. blank paper area from template overreach.
    """
    if strip_bgr.size == 0:
        return False
    sh, sw = strip_bgr.shape[:2]
    if sh < 16 or sw < 40:
        return False

    gray = cv2.cvtColor(strip_bgr, cv2.COLOR_BGR2GRAY)
    _, inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Ignore timing-strip side areas.
    x0 = int(sw * 0.08)
    x1 = int(sw * 0.92)
    inner = inv[:, x0:x1]
    if inner.size == 0:
        return False

    dark_ratio = float(np.mean(inner > 0))
    top_band_h = max(2, int(sh * 0.08))
    top_band_dark = float(np.mean(inner[:top_band_h, :] > 0))
    mid_band_h = max(2, int(sh * 0.12))
    mid0 = max(0, sh // 2 - mid_band_h // 2)
    mid1 = min(sh, mid0 + mid_band_h)
    mid_band_dark = float(np.mean(inner[mid0:mid1, :] > 0))

    # Printed contests have visible border + repeated row text/ink.
    # Tightened thresholds to avoid scoring non-printed template strips.
    has_border = top_band_dark >= 0.045
    has_row_ink = mid_band_dark >= 0.010
    has_overall_ink = dark_ratio >= 0.015
    return has_border and has_row_ink and has_overall_ink


def _zone_best_centroid(
    gray_bin_inv: np.ndarray,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
) -> tuple[float, float] | None:
    """Find darkest compact blob (filled square) in zone; return centroid."""
    h, w = gray_bin_inv.shape
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 <= x0 or y1 <= y0:
        return None
    roi = gray_bin_inv[y0:y1, x0:x1]
    contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
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
        M = cv2.moments(c)
        if M["m00"] < 1e-6:
            continue
        cx = M["m10"] / M["m00"] + x0
        cy = M["m01"] / M["m00"] + y0
        score = area
        if score > best_score:
            best_score = score
            best = (cx, cy)
    return best


def find_corner_homography(gray: np.ndarray) -> np.ndarray | None:
    """
    Use up to 8 fiducial marks (4 corners + 4 edge midpoints) to rectify the sheet
    to A4 canonical dimensions (900 × 1272 px).
    Returns 3×3 perspective matrix, or None if fewer than 4 fiducials are found.
    """
    h, w = gray.shape[:2]
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, inv = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Search zone size: 18 % of the shorter image dimension.
    # Slightly larger than before to handle images with visible background.
    m = int(min(w, h) * 0.18)
    # Top fiducials should stay near the page edge; use a shallower top band so
    # TC/TR do not drift down to nearby interior timing marks.
    top_band = max(18, int(min(w, h) * 0.11))
    edge_inset = max(2, int(min(w, h) * 0.01))
    hm = m // 2  # half-zone radius used for mid-edge zones

    dw, dh = 900, int(900 * 297 / 210)  # A4 canonical output (900 × 1272 px)

    # 8 fiducial zones: (search_box, destination_point)
    # 4 corners first, then 4 edge midpoints.
    zone_defs: list[tuple[tuple[int, int, int, int], tuple[int, int]]] = [
        # 4 corners
        ((0, 0, m, top_band),                        (0,       0       )),  # TL
        ((w - m - edge_inset, 0, w - edge_inset, top_band),                    (dw - 1,  0       )),  # TR
        ((w - m - edge_inset, h - m - edge_inset, w - edge_inset, h - edge_inset),                       (dw - 1,  dh - 1  )),  # BR
        ((0, h - m - edge_inset, m, h - edge_inset),                           (0,       dh - 1  )),  # BL
        # 4 edge midpoints
        ((w // 2 - hm, 0, w // 2 + hm, top_band),   (dw // 2, 0       )),  # TC
        ((w - m - edge_inset, h // 2 - hm, w - edge_inset, h // 2 + hm),      (dw - 1,  dh // 2 )),  # MR
        ((w // 2 - hm, h - m - edge_inset, w // 2 + hm, h - edge_inset),      (dw // 2, dh - 1  )),  # BC
        ((0, h // 2 - hm, m, h // 2 + hm),          (0,       dh // 2 )),  # ML
    ]

    src_pts: list[tuple[float, float]] = []
    dst_pts: list[tuple[int, int]] = []

    for (xa, ya, xb, yb), dst in zone_defs:
        c = _zone_best_centroid(inv, xa, ya, xb, yb)
        if c is not None:
            src_pts.append(c)
            dst_pts.append(dst)

    if len(src_pts) < 4:
        return None

    src = np.array(src_pts, dtype=np.float32)
    dst = np.array(dst_pts, dtype=np.float32)

    if len(src_pts) == 4:
        # Exactly 4 points — use exact perspective transform.
        return cv2.getPerspectiveTransform(src, dst)

    # Overdetermined (5–8 points): use RANSAC for robustness against
    # one or two misdetected fiducials.
    H, _mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    return H


def warp_if_possible(bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    H = find_corner_homography(gray)
    if H is None:
        return bgr
    h, w = bgr.shape[:2]
    dw, dh = 900, int(900 * 297 / 210)
    return cv2.warpPerspective(bgr, H, (dw, dh))


def _template_layout_mode(template: dict[str, Any]) -> str:
    tv = str(template.get("templateVersion") or "")
    if tv.startswith("ballot-template-v4"):
        return "v4"
    if tv.startswith("ballot-template-v3"):
        return "v3"
    if tv.startswith("ballot-template-v2"):
        return "v2"
    return "legacy"


def _is_modern_template(template: dict[str, Any]) -> bool:
    return _template_layout_mode(template) in {"v2", "v3", "v4"}


def preprocess_image(img: np.ndarray) -> dict[str, np.ndarray]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    norm = cv2.equalizeHist(blur)
    _, inv = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return {"gray": gray, "norm": norm, "inv": inv}


def _extract_corner_patch(gray: np.ndarray, cx: float, cy: float, size: int = 34) -> np.ndarray | None:
    h, w = gray.shape[:2]
    half = size // 2
    x0 = int(max(0, cx - half))
    y0 = int(max(0, cy - half))
    x1 = int(min(w, cx + half))
    y1 = int(min(h, cy + half))
    if x1 - x0 < size // 2 or y1 - y0 < size // 2:
        return None
    patch = gray[y0:y1, x0:x1]
    return cv2.resize(patch, (32, 32), interpolation=cv2.INTER_AREA)


def _fiducial_pattern_scores(patch_gray: np.ndarray) -> dict[str, float]:
    """
    Score expected unique corner fiducial cutouts in a normalized patch.
    Fiducial has a shared center white cutout + one corner-specific cutout.
    """
    _, bw = cv2.threshold(patch_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    white = (bw > 127).astype(np.uint8)
    # windows on normalized patch
    tl = float(np.mean(white[1:11, 1:11]))
    tr = float(np.mean(white[1:11, 21:31]))
    bl = float(np.mean(white[21:31, 1:11]))
    br = float(np.mean(white[21:31, 21:31]))
    center = float(np.mean(white[12:20, 12:20]))
    # Strong center white is required for valid marker.
    if center < 0.25:
        return {"tl": 0.0, "tr": 0.0, "bl": 0.0, "br": 0.0}
    bonus = min(0.4, center * 0.5)
    return {
        "tl": tl + bonus - 0.35 * (tr + bl + br) / 3.0,
        "tr": tr + bonus - 0.35 * (tl + bl + br) / 3.0,
        "bl": bl + bonus - 0.35 * (tl + tr + br) / 3.0,
        "br": br + bonus - 0.35 * (tl + tr + bl) / 3.0,
    }


def detect_corner_fiducials(img: np.ndarray) -> dict[str, Any]:
    """
    Detect fiducials in 4 corner zones and score unique corner patterns.
    Returns geometric corners for homography and pattern confidence for orientation checks.
    """
    prep = preprocess_image(img)
    gray = prep["gray"]
    inv = prep["inv"]
    h, w = gray.shape[:2]
    m = int(min(w, h) * 0.20)
    zones = {
        "img_tl": (0, 0, m, m),
        "img_tr": (w - m, 0, w, m),
        "img_br": (w - m, h - m, w, h),
        "img_bl": (0, h - m, m, h),
    }
    found: dict[str, dict[str, Any]] = {}
    for name, (x0, y0, x1, y1) in zones.items():
        c = _zone_best_centroid(inv, x0, y0, x1, y1)
        if c is None:
            continue
        patch = _extract_corner_patch(gray, c[0], c[1], size=max(28, int(min(w, h) * 0.04)))
        if patch is None:
            continue
        pattern_scores = _fiducial_pattern_scores(patch)
        best_label = max(pattern_scores, key=pattern_scores.get)
        found[name] = {
            "centroid": (float(c[0]), float(c[1])),
            "best_label": best_label,
            "pattern_scores": pattern_scores,
            "best_score": float(pattern_scores[best_label]),
        }
    conf = 0.0
    if found:
        conf = float(np.mean([f["best_score"] for f in found.values()]))
    return {"zones": zones, "found": found, "confidence": conf}


def compute_homography(corners: dict[str, tuple[float, float]], width: int, height: int) -> np.ndarray | None:
    need = ("img_tl", "img_tr", "img_br", "img_bl")
    if not all(k in corners for k in need):
        return None
    src = np.array([corners[k] for k in need], dtype=np.float32)
    dst = np.array(
        [(0, 0), (width - 1, 0), (width - 1, height - 1), (0, height - 1)],
        dtype=np.float32,
    )
    return cv2.getPerspectiveTransform(src, dst)


def _detect_page_outline_homography(img: np.ndarray, width: int, height: int) -> np.ndarray | None:
    """
    Fallback page-outline homography when corner fiducials are insufficient.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 60, 180)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    h, w = gray.shape[:2]
    min_area = float(h * w) * 0.20
    best_quad = None
    best_area = 0.0
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        peri = cv2.arcLength(c, True)
        if peri < 1:
            continue
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        if area > best_area:
            best_area = area
            best_quad = approx.reshape(4, 2).astype(np.float32)
    if best_quad is None:
        return None
    s = best_quad.sum(axis=1)
    d = np.diff(best_quad, axis=1).reshape(-1)
    tl = best_quad[np.argmin(s)]
    br = best_quad[np.argmax(s)]
    tr = best_quad[np.argmin(d)]
    bl = best_quad[np.argmax(d)]
    src = np.array([tl, tr, br, bl], dtype=np.float32)
    dst = np.array([(0, 0), (width - 1, 0), (width - 1, height - 1), (0, height - 1)], dtype=np.float32)
    return cv2.getPerspectiveTransform(src, dst)


def _normalize_warp_to_paper_bbox(warped: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """
    After homography, remove side/background padding by re-cropping to the
    dominant bright paper region, then resize back to canonical size.
    """
    h, w = warped.shape[:2]
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    # Robust bright-paper mask with fallback threshold.
    _, m1 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m2 = (gray > 150).astype(np.uint8) * 255
    mask = cv2.bitwise_or(m1, m2.astype(np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return warped, {"paper_bbox": (0, 0, w, h), "paper_bbox_confidence": 0.0}
    min_area = float(h * w) * 0.28
    best = None
    best_area = 0.0
    best_contour = None
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        # Prefer tall rectangle near A4 portrait ratio.
        ratio = bw / max(bh, 1)
        ratio_penalty = abs(ratio - (210 / 297))
        score = area * (1.0 - min(0.45, ratio_penalty))
        if score > best_area:
            best_area = score
            best = (x, y, bw, bh, area)
            best_contour = c
    if best is None:
        return warped, {"paper_bbox": (0, 0, w, h), "paper_bbox_confidence": 0.0}
    x, y, bw, bh, area = best
    if best_contour is not None:
        peri = cv2.arcLength(best_contour, True)
        if peri > 1:
            approx = cv2.approxPolyDP(best_contour, 0.02 * peri, True)
            if len(approx) == 4:
                quad = approx.reshape(4, 2).astype(np.float32)
                s = quad.sum(axis=1)
                d = np.diff(quad, axis=1).reshape(-1)
                tl = quad[np.argmin(s)]
                br = quad[np.argmax(s)]
                tr = quad[np.argmin(d)]
                bl = quad[np.argmax(d)]
                src = np.array([tl, tr, br, bl], dtype=np.float32)
                dst = np.array(
                    [(0, 0), (w - 1, 0), (w - 1, h - 1), (0, h - 1)],
                    dtype=np.float32,
                )
                Hq = cv2.getPerspectiveTransform(src, dst)
                normalized = cv2.warpPerspective(warped, Hq, (w, h))
                conf = float(min(1.0, area / (h * w)))
                return normalized, {
                    "paper_bbox": (int(x), int(y), int(x + bw), int(y + bh)),
                    "paper_bbox_confidence": conf,
                    "paper_quad": src.astype(int).tolist(),
                }
    # Keep a tiny safety inset to avoid black desk pixels.
    pad = 2
    x0 = max(0, x + pad)
    y0 = max(0, y + pad)
    x1 = min(w, x + bw - pad)
    y1 = min(h, y + bh - pad)
    if x1 - x0 < w * 0.45 or y1 - y0 < h * 0.65:
        return warped, {"paper_bbox": (0, 0, w, h), "paper_bbox_confidence": 0.0}
    cropped = warped[y0:y1, x0:x1]
    normalized = cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)
    conf = float(min(1.0, area / (h * w)))
    return normalized, {"paper_bbox": (int(x0), int(y0), int(x1), int(y1)), "paper_bbox_confidence": conf}


def _rotate_to_template_orientation(warped: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """
    Determine orientation from unique corner fiducials after warp.
    """
    best_img = warped
    best = {"rotation": 0, "score": -1.0, "labels": {}}
    expected = {"img_tl": "tl", "img_tr": "tr", "img_br": "br", "img_bl": "bl"}
    cur = warped
    for rot in (0, 90, 180, 270):
        det = detect_corner_fiducials(cur)
        found = det.get("found", {})
        score = 0.0
        labels: dict[str, str] = {}
        for z, exp in expected.items():
            hit = found.get(z)
            if not hit:
                continue
            labels[z] = str(hit.get("best_label") or "")
            # reward matches and penalize mismatch lightly
            if labels[z] == exp:
                score += 1.0 + float(hit.get("best_score") or 0.0)
            else:
                score -= 0.35
        if score > best["score"]:
            best = {"rotation": rot, "score": score, "labels": labels}
            best_img = cur
        cur = cv2.rotate(cur, cv2.ROTATE_90_CLOCKWISE)
    return best_img, best


def warp_for_template(img: np.ndarray, template: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    """
    Build warped canonical ballot image using template-aware logic.
    Returns (warped_image, debug_meta).
    """
    mode = _template_layout_mode(template)
    if mode == "legacy":
        H = _detect_page_outline_homography(img, LAYOUT_SPEC.canonical_w, LAYOUT_SPEC.canonical_h)
        if H is not None:
            warped = cv2.warpPerspective(
                img, H, (LAYOUT_SPEC.canonical_w, LAYOUT_SPEC.canonical_h)
            )
            warp_source = "legacy-page-outline"
        else:
            warped = warp_if_possible(img)
            warp_source = "legacy-fiducials"
        warped, paper_bbox_dbg = _normalize_warp_to_paper_bbox(warped)
        return warped, {
            "mode": "legacy",
            "warp_source": warp_source,
            **paper_bbox_dbg,
        }

    fid = detect_corner_fiducials(img)
    found = fid.get("found", {})
    corners: dict[str, tuple[float, float]] = {}
    for zone in ("img_tl", "img_tr", "img_br", "img_bl"):
        if zone in found:
            corners[zone] = tuple(found[zone]["centroid"])  # type: ignore[assignment]
    H = compute_homography(corners, LAYOUT_SPEC.canonical_w, LAYOUT_SPEC.canonical_h)
    warp_source = "corner-fiducials"
    if H is None:
        H = _detect_page_outline_homography(img, LAYOUT_SPEC.canonical_w, LAYOUT_SPEC.canonical_h)
        warp_source = "page-outline" if H is not None else "legacy-fallback"
    if H is not None:
        warped = cv2.warpPerspective(img, H, (LAYOUT_SPEC.canonical_w, LAYOUT_SPEC.canonical_h))
    else:
        warped = warp_if_possible(img)
    warped, orient = _rotate_to_template_orientation(warped)
    warped, paper_bbox_dbg = _normalize_warp_to_paper_bbox(warped)
    return warped, {
        "mode": mode,
        "warp_source": warp_source,
        "corner_confidence": float(fid.get("confidence") or 0.0),
        "orientation": orient,
        **paper_bbox_dbg,
    }


def detect_timing_marks(warped: np.ndarray) -> dict[str, Any]:
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    _, inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = gray.shape[:2]
    band = max(8, int(min(h, w) * TIMING_SPEC.band_thickness))
    edge_rois = {
        "top": inv[0:band, :],
        "bottom": inv[h - band : h, :],
        "left": inv[:, 0:band],
        "right": inv[:, w - band : w],
    }
    out: dict[str, list[tuple[float, float]]] = {k: [] for k in edge_rois}
    for edge, roi in edge_rois.items():
        contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            x, y, rw, rh = cv2.boundingRect(c)
            area = rw * rh
            if area < TIMING_SPEC.min_square_px**2 or area > TIMING_SPEC.max_square_px**2:
                continue
            ratio = rw / max(rh, 1)
            if ratio < 0.55 or ratio > 1.8:
                continue
            cx, cy = x + rw / 2.0, y + rh / 2.0
            if edge == "bottom":
                cy += h - band
            elif edge == "right":
                cx += w - band
            out[edge].append((cx, cy))
    # sort along major axis
    out["top"].sort(key=lambda p: p[0])
    out["bottom"].sort(key=lambda p: p[0])
    out["left"].sort(key=lambda p: p[1])
    out["right"].sort(key=lambda p: p[1])
    exp = {
        "top": TIMING_SPEC.top_count,
        "bottom": TIMING_SPEC.bottom_count,
        "left": TIMING_SPEC.left_count,
        "right": TIMING_SPEC.right_count,
    }
    count_score = np.mean(
        [max(0.0, 1.0 - abs(len(out[k]) - exp[k]) / max(exp[k], 1)) for k in exp]
    )
    expected = expected_edge_mark_positions(w, h)
    residuals: dict[str, float] = {}
    for k in ("top", "bottom", "left", "right"):
        pts = out[k]
        ex = expected[k]
        if not pts:
            residuals[k] = 999.0
            continue
        n = min(len(pts), len(ex))
        if k in ("top", "bottom"):
            dif = [abs(pts[i][0] - ex[i][0]) for i in range(n)]
        else:
            dif = [abs(pts[i][1] - ex[i][1]) for i in range(n)]
        residuals[k] = float(np.median(dif)) if dif else 999.0
    residual_med = float(np.median(list(residuals.values())))
    residual_score = max(0.0, 1.0 - residual_med / 18.0)
    confidence = 0.65 * float(count_score) + 0.35 * float(residual_score)
    return {
        "marks": out,
        "expected": exp,
        "residuals": residuals,
        "confidence": confidence,
    }


def decode_qr_v2(img_raw: np.ndarray, warped: np.ndarray) -> tuple[dict[str, Any] | None, str | None, float, dict[str, Any]]:
    """
    Decode QR from dedicated lower-right metadata zone (primary: post-warp).
    Fallback to broader search in raw image if needed.
    """
    det = cv2.QRCodeDetector()
    h, w = warped.shape[:2]
    x0 = int(w * LAYOUT_SPEC.qr_zone_x0)
    x1 = int(w * LAYOUT_SPEC.qr_zone_x1)
    y0 = int(h * LAYOUT_SPEC.qr_zone_y0)
    y1 = int(h * LAYOUT_SPEC.qr_zone_y1)
    qr_roi = warped[y0:y1, x0:x1]
    probes: list[np.ndarray] = []
    if qr_roi.size > 0:
        probes.append(qr_roi)
        probes.append(cv2.resize(qr_roi, None, fx=1.8, fy=1.8, interpolation=cv2.INTER_CUBIC))
        g = cv2.cvtColor(qr_roi, cv2.COLOR_BGR2GRAY)
        probes.append(cv2.cvtColor(cv2.equalizeHist(g), cv2.COLOR_GRAY2BGR))
    raw_h, raw_w = img_raw.shape[:2]
    fallback = img_raw[int(raw_h * 0.58) : raw_h, int(raw_w * 0.52) : raw_w]
    if fallback.size > 0:
        probes.append(fallback)
    last_raw = None
    for i, p in enumerate(probes):
        txt, _pts, _ = det.detectAndDecode(p)
        if not txt:
            continue
        last_raw = txt.strip()
        obj, raw = _parse_ballot_qr_json(last_raw)
        if obj is not None:
            # Confidence: prefer early probes from canonical QR zone.
            conf = 0.95 if i <= 1 else (0.85 if i <= 2 else 0.70)
            return obj, raw, conf, {"qr_crop": (x0, y0, x1, y1), "probe_index": i}
    return None, last_raw, 0.0, {"qr_crop": (x0, y0, x1, y1)}


def map_template_regions(template: dict[str, Any], width: int, height: int) -> dict[str, Any]:
    mode = _template_layout_mode(template)
    profile = TEMPLATE_LAYOUT_PROFILES.get(mode, TEMPLATE_LAYOUT_PROFILES["v2"])
    contests = template.get("contests") or []
    x0 = int(width * LAYOUT_SPEC.content_x0)
    x1 = int(width * LAYOUT_SPEC.content_x1)
    y0 = int(height * float(profile["contests_y0"]))
    y1 = int(height * float(profile["contests_y1"]))
    total_h = max(1, y1 - y0)
    if profile["weight_mode"] == "rows_single":
        weights = [max(2, len((c.get("options") or [])) + 2) for c in contests]
    else:
        weights = [max(1, (len((c.get("options") or [])) + 2) // 3) + 1 for c in contests]
    wsum = max(sum(weights), 1)
    bounds: list[tuple[int, int]] = []
    cum = 0
    for wv in weights:
        ya = y0 + int(total_h * cum / wsum)
        cum += wv
        yb = y0 + int(total_h * cum / wsum)
        bounds.append((ya, yb))
    return {
        "content_rect": (x0, int(height * LAYOUT_SPEC.content_y0), x1, int(height * LAYOUT_SPEC.content_y1)),
        "contests": bounds,
    }


def _score_bubble_v2(
    cell_bgr: np.ndarray,
    center_x_ratio: float | None = None,
    center_y_ratio: float | None = None,
) -> float:
    if cell_bgr.size == 0:
        return 0.0
    spec = BUBBLE_SPEC
    h, w = cell_bgr.shape[:2]
    if h < 10 or w < 20:
        return 0.0
    gray = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    cx = int(w * (center_x_ratio if center_x_ratio is not None else spec.center_x_in_cell))
    cy = int(h * (center_y_ratio if center_y_ratio is not None else spec.center_y_in_cell))
    r = int(max(spec.min_radius_px, min(spec.max_radius_px, min(w, h) * spec.radius_in_cell)))
    yy, xx = np.ogrid[:h, :w]
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    core = d2 <= int((r * spec.core_radius_ratio) ** 2)
    ring = (d2 >= int((r * spec.ring_inner_ratio) ** 2)) & (d2 <= int((r * spec.ring_outer_ratio) ** 2))
    bg = (d2 >= int((r * spec.bg_inner_ratio) ** 2)) & (d2 <= int((r * spec.bg_outer_ratio) ** 2))
    if not np.any(core) or not np.any(ring):
        return 0.0
    core_d = float(np.mean(255 - gray[core]))
    ring_d = float(np.mean(255 - gray[ring]))
    bg_d = float(np.mean(255 - gray[bg])) if np.any(bg) else ring_d
    # Relative fill against local print/background.
    numerator = max(0.0, core_d - 0.55 * ring_d)
    denom = max(14.0, bg_d + 24.0)
    return float(min(1.0, numerator / denom))

def _mean_fill_score(roi_bgr: np.ndarray) -> float:
    if roi_bgr.size == 0:
        return 0.0
    g = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    # Darker = more filled (ink)
    return float(np.mean(255 - g)) / 255.0


def _normalize_scores(scores: dict[str, float]) -> dict[str, float]:
    """
    Normalize per-contest scores so global lighting doesn't dominate:
    0.0 = lightest option in contest, 1.0 = darkest option in contest.
    """
    if not scores:
        return {}
    vals = list(scores.values())
    vmin = min(vals)
    vmax = max(vals)
    span = max(vmax - vmin, 1e-6)
    return {k: float((v - vmin) / span) for k, v in scores.items()}


def _is_abstain_option(option_id: str) -> bool:
    return option_id.startswith("abstain:")


def _contest_option_layout(
    options: list[dict[str, Any]],
    num_cols: int,
) -> tuple[list[tuple[dict[str, Any], int, int]], int]:
    """
    Build per-option (row, col) layout.
    For multi-column contests, reserve dedicated full-width row(s) for abstain
    after candidate rows so abstain is not forced into the 3-column candidate grid.
    """
    candidates = [o for o in options if not _is_abstain_option(str(o.get("optionId") or ""))]
    abstains = [o for o in options if _is_abstain_option(str(o.get("optionId") or ""))]
    layout: list[tuple[dict[str, Any], int, int]] = []

    if num_cols <= 1:
        for i, opt in enumerate(candidates):
            layout.append((opt, i, 0))
        base = len(candidates)
        for j, opt in enumerate(abstains):
            layout.append((opt, base + j, 0))
        return layout, max(1, len(layout))

    cand_rows = max(1, (len(candidates) + (num_cols - 1)) // num_cols) if candidates else 0
    for i, opt in enumerate(candidates):
        layout.append((opt, i // num_cols, i % num_cols))
    for j, opt in enumerate(abstains):
        # Abstain occupies its own extra row; use left-most lane for bubble.
        layout.append((opt, cand_rows + j, 0))
    total_rows = max(1, cand_rows + len(abstains))
    return layout, total_rows


def _score_bubble_in_grid_cell(cell_bgr: np.ndarray) -> float:
    """OMR v2 cell: [#][round bubble][name]. Score via bubble core-vs-ring contrast."""
    if cell_bgr.size == 0:
        return 0.0
    ch, cw = cell_bgr.shape[:2]
    if cw < 24 or ch < 12:
        return 0.0
    g = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2GRAY)
    g = cv2.GaussianBlur(g, (3, 3), 0)

    # CandidateOmrRow columns are [number][bubble][name].
    # Legacy 3-column rows place the bubble a bit further left on A4 prints.
    cx = int(cw * LEGACY_BUBBLE_CENTER_X)
    cy = int(ch * 0.50)
    # Bubble is print:w-4 (~9 px radius in the warped image) regardless of row height.
    # Cap at 12 to avoid measuring surrounding text when rows are tall.
    r = max(4, min(int(min(cw, ch) * 0.18), 12))

    yy, xx = np.ogrid[:ch, :cw]
    dist2 = (xx - cx) ** 2 + (yy - cy) ** 2
    core = dist2 <= int((r * 0.55) ** 2)
    ring = (dist2 >= int((r * 0.85) ** 2)) & (dist2 <= int((r * 1.40) ** 2))
    if not np.any(core) or not np.any(ring):
        return 0.0

    core_mean = float(np.mean(g[core]))
    ring_mean = float(np.mean(g[ring]))
    # Shaded bubble => core darker than surrounding ring.
    contrast = max(0.0, (ring_mean - core_mean) / 255.0)
    return float(contrast)


def _validate_contest_marks_v2(
    scores: dict[str, float],
    max_marks: int,
    mode: str = "v2",
    abstain_policy: str = "exclusive",
) -> tuple[list[str], dict[str, Any]]:
    """
    Normalize picks from v2 bubble scores.
    abstain_policy:
      - exclusive: abstain + candidate => invalid (clear picks)
      - prefer_abstain: abstain wins conflict
    """
    meta: dict[str, Any] = {}
    if not scores:
        return [], meta
    ordered = sorted(scores.items(), key=lambda kv: -kv[1])
    vals = np.array([v for _, v in ordered], dtype=np.float32)
    top = float(ordered[0][1])
    med = float(np.median(vals)) if vals.size else 0.0
    std = float(np.std(vals)) if vals.size else 0.0
    # adaptive floor from local spread; v2 needs stricter blank-page rejection.
    abs_floor = 0.11 if mode == "v2" else 0.075
    floor = max(abs_floor, med + max(0.036, std * 1.10))
    picks = [oid for oid, sc in ordered if sc >= floor][: max(1, int(max_marks))]
    second = float(ordered[1][1]) if len(ordered) > 1 else 0.0
    top_gap = top - second
    baseline_gap = top - med
    if max_marks <= 1:
        # Single-seat contests: require clear dominance, not just slight darkness.
        if top_gap < (0.024 if mode == "v2" else 0.014) or baseline_gap < (0.036 if mode == "v2" else 0.028):
            picks = []
    else:
        # Multi-seat contests: keep only marks clearly above local baseline.
        picks = [oid for oid in picks if (scores[oid] - med) >= (0.030 if mode == "v2" else 0.018)]
        if len(picks) == 1 and top < floor + (0.018 if mode == "v2" else 0.012):
            picks = []
    if len(picks) > max_marks:
        meta["overvote"] = True
        picks = []
    has_abs = any(_is_abstain_option(x) for x in picks)
    has_cand = any(not _is_abstain_option(x) for x in picks)
    if has_abs and has_cand:
        if abstain_policy == "prefer_abstain":
            picks = [x for x in picks if _is_abstain_option(x)][:1]
            meta["abstain_conflict_resolved"] = True
        else:
            picks = []
            meta["abstain_conflict"] = True
    # low confidence contest if scores are flat and weak
    if top < (0.11 if mode == "v2" else 0.07) or (top - med) < (0.026 if mode == "v2" else 0.02):
        meta["low_confidence"] = True
    return picks, meta


def score_bubbles_v2(warped_bgr: np.ndarray, template: dict[str, Any]) -> dict[str, Any]:
    mode = _template_layout_mode(template)
    profile = TEMPLATE_LAYOUT_PROFILES.get(mode, TEMPLATE_LAYOUT_PROFILES["v2"])
    contests = template.get("contests") or []
    if not contests:
        return {
            "raw_scores": {},
            "selectionsByPosition": {},
            "error": "no_contests_in_template",
            "confidence": 0.0,
        }
    h, w = warped_bgr.shape[:2]
    reg = map_template_regions(template, w, h)
    bounds = reg["contests"]
    x0, _cy0, x1, _cy1 = reg["content_rect"]
    content_w = max(1, x1 - x0)
    raw_scores: dict[str, dict[str, float]] = {}
    selections_by_position: dict[str, list[str]] = {}
    contest_conf: list[float] = []
    debug_contests: list[dict[str, Any]] = []
    for idx, contest in enumerate(contests):
        pid = str(contest.get("positionId") or "")
        options = contest.get("options") or []
        if not pid or not options or idx >= len(bounds):
            continue
        y0, y1 = bounds[idx]
        strip = warped_bgr[y0:y1, x0:x1]
        if strip.size == 0:
            raw_scores[pid] = {}
            selections_by_position[pid] = []
            continue
        sh, sw = strip.shape[:2]
        hdr = min(CONTEST_HEADER_SKIP_PX, max(2, sh - 16))
        grid = strip[hdr:, :]
        gh, gw = grid.shape[:2]
        if gh < 20 or gw < 30:
            raw_scores[pid] = {}
            selections_by_position[pid] = []
            continue
        opt_layout, num_rows = _contest_option_layout(options, int(profile["num_cols"]))
        row_h = min(float(ROW_HEIGHT_PX), gh / max(num_rows, 1))
        col_w = content_w / float(profile["num_cols"])
        pad_x = int(col_w * LAYOUT_SPEC.contest_inner_pad_x)
        pad_y = int(row_h * LAYOUT_SPEC.contest_inner_pad_y)
        scores: dict[str, float] = {}
        bubble_dbg: list[dict[str, Any]] = []
        for opt, rr, cc in opt_layout:
            oid = str(opt.get("optionId") or "")
            if not oid:
                continue
            ys0 = max(0, int(rr * row_h) + pad_y)
            ys1 = min(gh, int((rr + 1) * row_h) - pad_y)
            if profile["bubble_lane"] is not None:
                lane0, lane1 = profile["bubble_lane"]
                # Template-aware single-column bubble lane (v3/v4).
                xs0 = max(0, int(gw * float(lane0)))
                xs1 = min(gw, int(gw * float(lane1)))
                cell = grid[ys0:ys1, xs0:xs1]
                bx, by = profile["bubble_center"]
                sc = _score_bubble_v2(
                    cell,
                    center_x_ratio=float(bx) if bx is not None else None,
                    center_y_ratio=float(by) if by is not None else None,
                )
            else:
                xs0 = max(0, int(cc * col_w) + pad_x)
                xs1 = min(gw, int((cc + 1) * col_w) - pad_x)
                cell = grid[ys0:ys1, xs0:xs1]
                sc = _score_bubble_v2(cell)
            scores[oid] = sc
            bubble_dbg.append(
                {
                    "optionId": oid,
                    "cell": (x0 + xs0, y0 + hdr + ys0, x0 + xs1, y0 + hdr + ys1),
                    "score": sc,
                }
            )
        raw_scores[pid] = scores
        picks, meta = _validate_contest_marks_v2(
            scores,
            int(contest.get("maxMarks") or 1),
            mode=mode,
        )
        if meta.get("overvote"):
            raw_scores[pid]["_overvote"] = True
        if meta.get("abstain_conflict"):
            raw_scores[pid]["_abstain_conflict"] = True
        if meta.get("abstain_conflict_resolved"):
            raw_scores[pid]["_abstain_conflict_resolved"] = True
        if meta.get("low_confidence"):
            raw_scores[pid]["_low_confidence"] = True
        selections_by_position[pid] = picks
        cvals = list(scores.values())
        cconf = float(max(cvals) - np.median(cvals)) if cvals else 0.0
        contest_conf.append(max(0.0, min(1.0, cconf * 8.0)))
        debug_contests.append(
            {
                "positionId": pid,
                "rect": (x0, y0, x1, y1),
                "header_y": y0 + hdr,
                "bubbles": bubble_dbg,
            }
        )
    bubble_conf = float(np.mean(contest_conf)) if contest_conf else 0.0
    return {
        "raw_scores": raw_scores,
        "selectionsByPosition": selections_by_position,
        "error": None,
        "confidence": bubble_conf,
        "contestsDetected": len(debug_contests),
        "contestsInTemplate": len(contests),
        "debug": {"regions": reg, "contests": debug_contests},
    }


def read_bubbles_from_template(warped_bgr: np.ndarray, template: dict[str, Any]) -> dict[str, Any]:
    """
    Map template contests to bubble fill scores.

    PrintableBallotSheet OMR layout:
    - Contests are stacked vertically (same order as template "contests").
    - Within each contest, options are printed in a row-major 3-column grid.
    """
    contests: list[dict[str, Any]] = template.get("contests") or []
    if not contests:
        return {
            "raw_scores": {},
            "selectionsByPosition": {},
            "error": "no_contests_in_template",
        }

    H, W = warped_bgr.shape[:2]
    # Keep crop window synced to exported scanner layout constants.
    top_skip = int(H * LAYOUT_SPEC.content_y0)
    y_body1 = int(H * LAYOUT_SPEC.content_y1)
    if y_body1 <= top_skip + 80:
        top_skip = int(H * 0.10)
        y_body1 = int(H * 0.97)
    body = warped_bgr[top_skip:y_body1, :]
    bh, bw = body.shape[:2]
    if bh < 80 or bw < 80:
        return {"raw_scores": {}, "selectionsByPosition": {}, "error": "body_too_small"}

    side_margin = int(W * LAYOUT_SPEC.content_x0)
    content_x0 = side_margin
    content_w = int(W * (LAYOUT_SPEC.content_x1 - LAYOUT_SPEC.content_x0))

    # --- Contest boundary detection -------------------------------------------
    # The scanning template may include more contests than are actually printed
    # on this voter's ballot (e.g. all department-governor positions are in the
    # template but only the voter's own governor race is on the sheet).
    # Try to detect the actual printed contest borders first; if we find exactly
    # n_template blocks we use the template as-is. If we find fewer, skip the
    # template contests whose strips are missing (they simply weren't printed).
    n_template = len(contests)
    body_gray_for_detect = cv2.cvtColor(body, cv2.COLOR_BGR2GRAY)
    detected_tops = _detect_contest_top_edges(body_gray_for_detect, n_template)

    # Build per-contest (y0, y1) boundaries.
    # Priority: detected borders > row-weighted estimate.
    if detected_tops is not None:
        # Detected exactly n_template borders → use them directly.
        contest_y_bounds: list[tuple[int, int]] = []
        for i, top in enumerate(detected_tops):
            bot = detected_tops[i + 1] if i + 1 < len(detected_tops) else bh
            contest_y_bounds.append((top, bot))
        n_actual = n_template
        contests_to_read = list(range(n_template))
    else:
        # Try to detect fewer contests (template has extras not on this ballot).
        # Try from n_template-1 down to n_template//2.
        found_n: int | None = None
        found_tops: list[int] | None = None
        for try_n in range(n_template - 1, max(n_template // 2 - 1, 0), -1):
            t = _detect_contest_top_edges(body_gray_for_detect, try_n)
            if t is not None:
                found_n = try_n
                found_tops = t
                break

        if found_n is not None and found_tops is not None:
            # Map the found blocks to the first found_n template contests that
            # have matching candidate counts (best-effort: just take first found_n).
            contest_y_bounds = []
            for i, top in enumerate(found_tops):
                bot = found_tops[i + 1] if i + 1 < len(found_tops) else bh
                contest_y_bounds.append((top, bot))
            n_actual = found_n
            contests_to_read = list(range(found_n))
        else:
            # Fallback: weight strips by candidate row count.
            contest_row_weights = [
                max(1, (len(contest.get("options") or []) + 2) // 3) + 1
                for contest in contests
            ]
            total_weight = max(sum(contest_row_weights), 1)
            cumulative = 0
            contest_y_bounds = []
            for w_val in contest_row_weights:
                y0_f = int(bh * cumulative / total_weight)
                cumulative += w_val
                y1_f = int(bh * cumulative / total_weight)
                contest_y_bounds.append((y0_f, y1_f))
            n_actual = n_template
            contests_to_read = list(range(n_template))

    raw_scores: dict[str, dict[str, float]] = {}
    selections_by_position: dict[str, list[str]] = {}

    for idx, contest in enumerate(contests):
        if idx not in contests_to_read:
            continue
        bound_idx = contests_to_read.index(idx)

        pid = str(contest.get("positionId") or "")
        max_marks = int(contest.get("maxMarks") or 1)
        options = contest.get("options") or []
        if not pid or not options:
            continue

        y0, y1 = contest_y_bounds[bound_idx]
        strip = body[y0:y1, :]
        if strip.size == 0:
            continue
        if not _looks_like_printed_contest(strip):
            # Skip template contests that are not physically printed on this ballot.
            raw_scores[pid] = {}
            selections_by_position[pid] = []
            continue

        opt_layout, num_rows = _contest_option_layout(options, 3)
        sh, sw = strip.shape[:2]
        # Omit colored title + "Choose — N" band at top of each contest block.
        # Absolute skip across all contests.
        hdr = min(CONTEST_HEADER_SKIP_PX, max(2, sh - 16))
        grid = strip[hdr:, :] if sh > hdr + 16 else strip
        sh, sw = grid.shape[:2]
        if sh < 20 or sw < 30:
            continue
        row_h = min(float(ROW_HEIGHT_PX), sh / max(num_rows, 1))
        # Divide only the content-area width (between timing strips) into 3 columns.
        col_w = content_w / 3.0

        scores: dict[str, float] = {}
        for opt, r, c in opt_layout:
            oid = str(opt.get("optionId") or "")
            if not oid:
                continue
            ys0 = int(r * row_h)
            ys1 = int((r + 1) * row_h)
            # Offset columns by the side margin so they align with the printed content.
            xs0 = content_x0 + int(c * col_w)
            xs1 = content_x0 + int((c + 1) * col_w)
            cell = grid[ys0:ys1, xs0:xs1]
            scores[oid] = _score_bubble_in_grid_cell(cell)

        raw_scores[pid] = scores

        if not scores:
            selections_by_position[pid] = []
            continue

        # Absolute + relative thresholds reduce false positives in uneven lighting.
        sorted_opts = sorted(scores.items(), key=lambda x: -x[1])
        norm_scores = _normalize_scores(scores)
        abs_threshold = 0.07
        mark_floor = 0.075
        rel_threshold = 0.50
        second_gap = 0.03
        picks: list[str] = []

        vals = np.array(list(scores.values()), dtype=np.float32)
        top_abs = float(sorted_opts[0][1]) if sorted_opts else 0.0
        median_abs = float(np.median(vals)) if vals.size else 0.0
        std_abs = float(np.std(vals)) if vals.size else 0.0
        # Blank/noise guard: skip selection when the top bubble is weak and not
        # meaningfully separated from the contest baseline.
        low_signal_contest = top_abs < mark_floor or (top_abs - median_abs) < 0.02
        # Additional flat-noise veto (all options similarly weak).
        if std_abs < 0.008 and top_abs < 0.11:
            low_signal_contest = True

        if max_marks > 1:
            # Multi-seat / multiple shading: take up to max_marks darkest marks
            vals = sorted(scores.values())
            baseline = float(np.median(vals))
            dynamic_min = max(abs_threshold, baseline + 0.03, mark_floor)
            picks = [
                oid
                for oid, _ in sorted_opts
                if scores[oid] >= dynamic_min and norm_scores[oid] >= rel_threshold
            ][:max_marks]
            if (
                not picks
                and sorted_opts[0][1] >= dynamic_min
                and (sorted_opts[0][1] - (sorted_opts[1][1] if len(sorted_opts) > 1 else 0.0)) >= second_gap
            ):
                picks = [sorted_opts[0][0]]
            if len(picks) > max_marks:
                picks = [oid for oid, _ in sorted_opts[:max_marks]]

            # Guard against phantom single picks on blank/noisy multi-seat contests.
            # Accept a lone mark only when it is clearly strong above baseline.
            if len(picks) == 1:
                lone = picks[0]
                lone_score = float(scores.get(lone, 0.0))
                strong_single = (
                    lone_score >= max(dynamic_min + 0.02, 0.12)
                    and (lone_score - baseline) >= 0.05
                )
                if not strong_single:
                    picks = []
        else:
            top_oid, top_abs = sorted_opts[0]
            top_rel = norm_scores[top_oid]
            second_abs = sorted_opts[1][1] if len(sorted_opts) > 1 else 0.0
            strong_vs_baseline = (top_abs - median_abs) >= 0.03
            if (
                top_abs < max(abs_threshold, mark_floor)
                or top_rel < rel_threshold
                or (not strong_vs_baseline and top_abs < 0.12)
            ):
                picks = []
            else:
                if (top_abs - second_abs) >= second_gap:
                    picks = [top_oid]
                else:
                    picks = []
                    raw_scores[pid]["_overvote"] = True

        # Abstain must be exclusive from candidate picks in the same contest.
        has_abstain = any(_is_abstain_option(oid) for oid in picks)
        has_candidate = any(not _is_abstain_option(oid) for oid in picks)
        if has_abstain and has_candidate:
            abstain_only = [oid for oid in picks if _is_abstain_option(oid)]
            if abstain_only and len(abstain_only) == 1:
                picks = abstain_only
                raw_scores[pid]["_abstain_conflict_resolved"] = True
            else:
                picks = []
                raw_scores[pid]["_abstain_conflict"] = True

        # Optional ML correction layer for ambiguous/noisy marks.
        # Applies conservatively and records probabilities for audit.
        ml = bubble_ml_corrector.refine(scores=scores, max_marks=max_marks)
        if ml is not None:
            raw_scores[pid]["_ml_probs"] = ml.probabilities
            ambiguous = (
                len(picks) == 0
                or bool(raw_scores[pid].get("_overvote"))
                or bool(raw_scores[pid].get("_abstain_conflict"))
            )
            # Do not let ML force a pick in low-signal contests (common on blank ballots).
            if ambiguous and ml.picks and not low_signal_contest:
                picks = ml.picks
                raw_scores[pid]["_ml_override"] = True

            # Re-apply abstain exclusivity after any ML override.
            has_abstain = any(_is_abstain_option(oid) for oid in picks)
            has_candidate = any(not _is_abstain_option(oid) for oid in picks)
            if has_abstain and has_candidate:
                abstain_only = [oid for oid in picks if _is_abstain_option(oid)]
                if len(abstain_only) == 1:
                    picks = abstain_only
                    raw_scores[pid]["_abstain_conflict_resolved"] = True
                else:
                    picks = []
                    raw_scores[pid]["_abstain_conflict"] = True

        selections_by_position[pid] = picks

    return {
        "raw_scores": raw_scores,
        "selectionsByPosition": selections_by_position,
        "error": None,
        "mlCorrection": bubble_ml_corrector.status,
        "contestsDetected": n_actual,
        "contestsInTemplate": n_template,
    }


def debug_annotate_ballot(
    warped_bgr: np.ndarray,
    template: dict[str, Any],
    bubble_result: dict[str, Any],
) -> np.ndarray:
    """
    Draw OMR detection geometry on the warped image and return the annotated copy.

    Color legend:
      Red fill (25 % alpha)  — skipped header / footer bands
      Orange lines           — side-margin boundaries (timing strips)
      Cyan lines             — column dividers
      Colored rect + label   — each contest strip (cycles through 6 colours)
      Dark-yellow line       — per-contest header-bar skip
      Green filled circle    — bubble picked as a mark
      Yellow ring            — above threshold but not picked (overvote / ambiguous)
      Red ring               — below threshold (blank / noise)
      Grey text              — raw score next to each bubble
    """
    canvas = warped_bgr.copy()
    H, W = canvas.shape[:2]
    contests: list[dict[str, Any]] = template.get("contests") or []
    dbg = bubble_result.get("debug") if isinstance(bubble_result, dict) else None
    # v2 overlay path: use template-mapped regions and scored bubble cells directly.
    if isinstance(dbg, dict) and isinstance(dbg.get("contests"), list):
        for c in dbg["contests"]:
            x0, y0, x1, y1 = [int(v) for v in c.get("rect", (0, 0, 0, 0))]
            cv2.rectangle(canvas, (x0, y0), (x1, y1), (0, 220, 120), 2)
            hy = int(c.get("header_y", y0))
            cv2.line(canvas, (x0, hy), (x1, hy), (0, 190, 190), 1)
            cv2.putText(
                canvas,
                str(c.get("positionId", ""))[:28],
                (x0 + 4, y0 + 12),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.35,
                (0, 220, 120),
                1,
                cv2.LINE_AA,
            )
            for b in c.get("bubbles", []):
                bx0, by0, bx1, by1 = [int(v) for v in b.get("cell", (0, 0, 0, 0))]
                cv2.rectangle(canvas, (bx0, by0), (bx1, by1), (130, 130, 130), 1)
                score = float(b.get("score", 0.0))
                col = (0, 255, 0) if score >= 0.09 else ((0, 220, 255) if score >= 0.07 else (80, 80, 255))
                cx = (bx0 + bx1) // 2
                cy = (by0 + by1) // 2
                rad = max(4, min((bx1 - bx0) // 8, 12))
                cv2.circle(canvas, (cx, cy), rad, col, 2)
                cv2.putText(
                    canvas,
                    f"{score:.2f}",
                    (min(W - 35, cx + rad + 2), min(H - 3, cy + 4)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.28,
                    (230, 230, 230),
                    1,
                    cv2.LINE_AA,
                )
        return canvas

    # ── Recompute the same geometry as read_bubbles_from_template ──────────
    top_skip = int(H * LAYOUT_SPEC.content_y0)
    y_body1 = int(H * LAYOUT_SPEC.content_y1)
    if y_body1 <= top_skip + 80:
        top_skip = int(H * 0.10)
        y_body1 = int(H * 0.97)

    bh = y_body1 - top_skip
    side_margin = int(W * LAYOUT_SPEC.content_x0)
    content_x0 = side_margin
    content_w = int(W * (LAYOUT_SPEC.content_x1 - LAYOUT_SPEC.content_x0))
    col_w = content_w / 3.0

    # Skip-zone overlay (semi-transparent red)
    overlay = canvas.copy()
    cv2.rectangle(overlay, (0, 0), (W, top_skip), (0, 0, 180), -1)
    cv2.rectangle(overlay, (0, y_body1), (W, H), (0, 0, 180), -1)
    cv2.addWeighted(overlay, 0.28, canvas, 0.72, 0, canvas)
    cv2.line(canvas, (0, top_skip), (W, top_skip), (0, 0, 255), 2)
    cv2.line(canvas, (0, y_body1), (W, y_body1), (0, 0, 200), 2)
    cv2.putText(canvas, "HEADER SKIP", (4, top_skip - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1, cv2.LINE_AA)
    cv2.putText(canvas, "FOOTER SKIP", (4, y_body1 + 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 200), 1, cv2.LINE_AA)

    # Side-margin lines (orange)
    cv2.line(canvas, (content_x0, top_skip), (content_x0, y_body1), (0, 140, 255), 2)
    cv2.line(canvas, (content_x0 + content_w, top_skip),
             (content_x0 + content_w, y_body1), (0, 140, 255), 2)

    # Column dividers (cyan)
    for c in range(1, 3):
        x = content_x0 + int(c * col_w)
        cv2.line(canvas, (x, top_skip), (x, y_body1), (255, 200, 0), 1)

    # ── Fiducial search zones + detected centroids ─────────────────────────────
    # Re-run fiducial detection so we can visualise which squares were found.
    gray_dbg = cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2GRAY)
    blur_dbg = cv2.GaussianBlur(gray_dbg, (3, 3), 0)
    _, inv_dbg = cv2.threshold(blur_dbg, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    m_dbg = int(min(W, H) * 0.18)
    top_band_dbg = max(18, int(min(W, H) * 0.11))
    edge_inset_dbg = max(2, int(min(W, H) * 0.01))
    hm_dbg = m_dbg // 2
    fid_zones = [
        ((0, 0, m_dbg, top_band_dbg),                            "TL"),
        ((W - m_dbg - edge_inset_dbg, 0, W - edge_inset_dbg, top_band_dbg),                        "TR"),
        ((W - m_dbg - edge_inset_dbg, H - m_dbg - edge_inset_dbg, W - edge_inset_dbg, H - edge_inset_dbg),                           "BR"),
        ((0, H - m_dbg - edge_inset_dbg, m_dbg, H - edge_inset_dbg),                               "BL"),
        ((W // 2 - hm_dbg, 0, W // 2 + hm_dbg, top_band_dbg),   "TC"),
        ((W - m_dbg - edge_inset_dbg, H // 2 - hm_dbg, W - edge_inset_dbg, H // 2 + hm_dbg),      "MR"),
        ((W // 2 - hm_dbg, H - m_dbg - edge_inset_dbg, W // 2 + hm_dbg, H - edge_inset_dbg),      "BC"),
        ((0, H // 2 - hm_dbg, m_dbg, H // 2 + hm_dbg),          "ML"),
    ]
    for (fxa, fya, fxb, fyb), flabel in fid_zones:
        # Draw search zone (thin white dashed-style rect)
        cv2.rectangle(canvas, (fxa, fya), (fxb, fyb), (200, 200, 200), 1)
        fc = _zone_best_centroid(inv_dbg, fxa, fya, fxb, fyb)
        if fc is not None:
            fx, fy = int(fc[0]), int(fc[1])
            # Green crosshair = detected fiducial
            cv2.drawMarker(canvas, (fx, fy), (0, 255, 80), cv2.MARKER_CROSS, 14, 2)
            cv2.putText(canvas, flabel, (fx + 6, fy - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 255, 80), 1, cv2.LINE_AA)
        else:
            # Red X = fiducial not found in this zone
            cx_z, cy_z = (fxa + fxb) // 2, (fya + fyb) // 2
            cv2.drawMarker(canvas, (cx_z, cy_z), (0, 0, 220), cv2.MARKER_TILTED_CROSS, 10, 2)

    # ── Contest boundary detection (same logic as read_bubbles_from_template) ─
    n_template = len(contests)
    body_gray = cv2.cvtColor(warped_bgr[top_skip:y_body1, :], cv2.COLOR_BGR2GRAY)
    detected_tops = _detect_contest_top_edges(body_gray, n_template)

    if detected_tops is not None:
        contest_y_bounds = [
            (detected_tops[i], detected_tops[i + 1] if i + 1 < len(detected_tops) else bh)
            for i in range(len(detected_tops))
        ]
        contests_to_read = list(range(n_template))
    else:
        found_n: int | None = None
        found_tops: list[int] | None = None
        for try_n in range(n_template - 1, max(n_template // 2 - 1, 0), -1):
            t = _detect_contest_top_edges(body_gray, try_n)
            if t is not None:
                found_n = try_n
                found_tops = t
                break
        if found_n is not None and found_tops is not None:
            contest_y_bounds = [
                (found_tops[i], found_tops[i + 1] if i + 1 < len(found_tops) else bh)
                for i in range(len(found_tops))
            ]
            contests_to_read = list(range(found_n))
        else:
            weights = [
                max(1, (len(c.get("options") or []) + 2) // 3) + 1 for c in contests
            ]
            total_w = max(sum(weights), 1)
            cum = 0
            contest_y_bounds = []
            for wv in weights:
                y0f = int(bh * cum / total_w)
                cum += wv
                y1f = int(bh * cum / total_w)
                contest_y_bounds.append((y0f, y1f))
            contests_to_read = list(range(n_template))

    strip_colors = [
        (0, 220, 80),    # green
        (0, 200, 255),   # yellow
        (255, 140, 0),   # blue-orange
        (180, 0, 255),   # purple
        (0, 255, 200),   # teal
        (255, 80, 180),  # pink
    ]

    raw_scores: dict[str, Any] = bubble_result.get("raw_scores") or {}
    selections: dict[str, list[str]] = bubble_result.get("selectionsByPosition") or {}

    for idx, contest in enumerate(contests):
        if idx not in contests_to_read:
            continue
        bound_idx = contests_to_read.index(idx)
        if bound_idx >= len(contest_y_bounds):
            continue

        y0_rel, y1_rel = contest_y_bounds[bound_idx]
        y0 = top_skip + y0_rel
        y1 = top_skip + y1_rel
        color = strip_colors[idx % len(strip_colors)]
        pid = str(contest.get("positionId") or "")
        options = contest.get("options") or []
        opt_layout, num_rows = _contest_option_layout(options, 3)

        # Contest strip rectangle
        cv2.rectangle(canvas, (content_x0, y0), (content_x0 + content_w, y1), color, 2)
        cv2.putText(canvas, pid[:28], (content_x0 + 4, y0 + 13),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, color, 1, cv2.LINE_AA)

        # Header-bar skip line (dark yellow)
        strip_h = y1_rel - y0_rel
        hdr = min(CONTEST_HEADER_SKIP_PX, max(2, strip_h - 16))
        cv2.line(canvas, (content_x0, y0 + hdr), (content_x0 + content_w, y0 + hdr),
                 (0, 180, 180), 1)

        grid_h = strip_h - hdr
        if grid_h < 20:
            continue
        row_h = min(float(ROW_HEIGHT_PX), grid_h / max(num_rows, 1))

        contest_scores: dict[str, Any] = raw_scores.get(pid) or {}
        picked: list[str] = selections.get(pid) or []

        for opt, row_i, col_i in opt_layout:
            oid = str(opt.get("optionId") or "")

            ys0 = y0 + hdr + int(row_i * row_h)
            ys1 = y0 + hdr + int((row_i + 1) * row_h)
            xs0 = content_x0 + int(col_i * col_w)
            xs1 = content_x0 + int((col_i + 1) * col_w)

            # Cell outline (thin grey)
            cv2.rectangle(canvas, (xs0, ys0), (xs1, ys1), (100, 100, 100), 1)

            # Bubble position
            cw_cell = xs1 - xs0
            ch_cell = ys1 - ys0
            bx = xs0 + int(cw_cell * LEGACY_BUBBLE_CENTER_X)
            by_ = ys0 + int(ch_cell * 0.50)
            br = max(4, min(int(min(cw_cell, ch_cell) * 0.18), 12))

            score_val = float(contest_scores.get(oid) or 0.0)
            is_picked = oid in picked

            if is_picked:
                cv2.circle(canvas, (bx, by_), br, (0, 255, 0), -1)          # green fill
                cv2.circle(canvas, (bx, by_), br + 2, (0, 180, 0), 2)
            elif score_val >= 0.075:
                cv2.circle(canvas, (bx, by_), br, (0, 220, 255), 2)         # yellow ring
            else:
                cv2.circle(canvas, (bx, by_), br, (60, 60, 255), 1)         # red ring

            # Score text
            cv2.putText(canvas, f"{score_val:.2f}", (bx + br + 2, by_ + 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.22, (200, 200, 200), 1, cv2.LINE_AA)

    # Legend (bottom-left)
    legend = [
        ((0, 255, 0), "Picked mark"),
        ((0, 220, 255), "Above threshold"),
        ((60, 60, 255), "Below threshold"),
        ((0, 0, 255), "Skip zone"),
        ((0, 140, 255), "Side margin"),
        ((255, 200, 0), "Column divider"),
        ((0, 255, 80), "Fiducial detected"),
        ((0, 0, 220), "Fiducial NOT found"),
    ]
    lx, ly = 4, H - 4 - len(legend) * 14
    for lc, lt in legend:
        cv2.rectangle(canvas, (lx, ly), (lx + 10, ly + 10), lc, -1)
        cv2.putText(canvas, lt, (lx + 14, ly + 9),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.3, (230, 230, 230), 1, cv2.LINE_AA)
        ly += 14

    return canvas


def selections_multi_to_flat(by_pos: dict[str, list[str]]) -> dict[str, str]:
    """Comma-separate multiple marks for legacy / DB-friendly maps."""
    out: dict[str, str] = {}
    for k, ids in by_pos.items():
        if not ids:
            continue
        out[k] = ids[0] if len(ids) == 1 else ",".join(str(x) for x in ids)
    return out


def _scan_ballot_image_once(img: np.ndarray, template: dict[str, Any]) -> dict[str, Any]:
    mode = _template_layout_mode(template)

    # Keep v2 on the legacy-tuned reader path (it has dedicated contest/bubble
    # heuristics calibrated for the v2 printed geometry).
    if mode == "v2":
        qr_obj, qr_raw = decode_qr_ballot(img)
        warped, warp_dbg = warp_for_template(img, template)
        if qr_obj is None:
            qr_obj2, qr_raw2 = decode_qr_ballot(warped)
            if qr_obj2 is not None:
                qr_obj, qr_raw = qr_obj2, qr_raw2
            elif qr_raw is None and qr_raw2:
                qr_raw = qr_raw2
        bubble = read_bubbles_from_template(warped, template)
        by_pos = dict(bubble.get("selectionsByPosition") or {})
        return {
            "qr": qr_obj,
            "qrRaw": qr_raw,
            "bubbleRead": {
                **bubble,
                "warpDebug": warp_dbg,
            },
            "selectionsByPosition": by_pos,
            "rawBubbleScores": bubble.get("raw_scores") or {},
            "selectionsFlat": selections_multi_to_flat(by_pos),
            "warpApplied": True,
        }

    if _is_modern_template(template):
        failure: str | None = None
        fail_conf = 0.0
        warped, warp_dbg = warp_for_template(img, template)
        orient = warp_dbg.get("orientation") or {}
        if warp_dbg.get("warp_source") == "legacy-fallback":
            failure = "insufficient_fiducials"
            fail_conf = float(warp_dbg.get("corner_confidence") or 0.0)
        elif warp_dbg.get("warp_source") == "page-outline":
            # valid fallback, but mark medium confidence for alignment
            fail_conf = max(fail_conf, 0.0)
        orient_conf = max(0.0, min(1.0, (float(orient.get("score", 0.0)) + 0.2) / 3.0))
        if orient_conf < 0.28 and failure is None:
            failure = "orientation_ambiguous"
            fail_conf = orient_conf
        timing = detect_timing_marks(warped)
        timing_conf = float(timing.get("confidence") or 0.0)
        if timing_conf < 0.30 and failure is None:
            failure = "timing_alignment_low_confidence"
            fail_conf = timing_conf
        qr_obj, qr_raw, qr_conf, qr_dbg = decode_qr_v2(img, warped)
        if qr_obj is None and failure is None:
            failure = "qr_unreadable"
            fail_conf = qr_conf
        bubble = score_bubbles_v2(warped, template)
        bubble_conf = float(bubble.get("confidence") or 0.0)
        if bubble_conf < 0.18 and failure is None:
            failure = "bubble_confidence_too_low"
            fail_conf = bubble_conf
        by_pos: dict[str, list[str]] = dict(bubble.get("selectionsByPosition") or {})
        corner_conf = float(warp_dbg.get("corner_confidence") or 0.0)
        confidences = {
            "page_detection": corner_conf,
            "corner_fiducials": corner_conf,
            "orientation": orient_conf,
            "timing_alignment": timing_conf,
            "qr_decode": qr_conf,
            "bubble_classification": bubble_conf,
        }
        return {
            "qr": qr_obj,
            "qrRaw": qr_raw,
            "bubbleRead": {
                **bubble,
                "failureReason": failure,
                "failureConfidence": fail_conf,
                "confidence": confidences,
                "timing": timing,
                "orientation": orient,
                "qrDebug": qr_dbg,
                "warpDebug": warp_dbg,
            },
            "selectionsByPosition": by_pos,
            "rawBubbleScores": bubble.get("raw_scores") or {},
            "selectionsFlat": selections_multi_to_flat(by_pos),
            "warpApplied": True,
        }

    qr_obj, qr_raw = decode_qr_ballot(img)
    warped, warp_dbg = warp_for_template(img, template)
    if qr_obj is None:
        qr_obj2, qr_raw2 = decode_qr_ballot(warped)
        if qr_obj2 is not None:
            qr_obj, qr_raw = qr_obj2, qr_raw2
        elif qr_raw is None and qr_raw2:
            qr_raw = qr_raw2
    bubble = read_bubbles_from_template(warped, template)
    by_pos = dict(bubble.get("selectionsByPosition") or {})
    return {
        "qr": qr_obj,
        "qrRaw": qr_raw,
        "bubbleRead": {
            **bubble,
            "warpDebug": warp_dbg,
        },
        "selectionsByPosition": by_pos,
        "rawBubbleScores": bubble.get("raw_scores") or {},
        "selectionsFlat": selections_multi_to_flat(by_pos),
        "warpApplied": True,
    }


def _scan_result_quality(result: dict[str, Any]) -> float:
    bubble = (result.get("bubbleRead") or {}) if isinstance(result, dict) else {}
    confidence = bubble.get("confidence")
    if isinstance(confidence, dict):
        vals = [float(v) for v in confidence.values() if isinstance(v, (int, float))]
        base_conf = float(np.mean(vals)) if vals else 0.0
    else:
        base_conf = float(confidence or 0.0)
    contests_detected = int(bubble.get("contestsDetected") or 0)
    has_qr = 1.0 if result.get("qr") else 0.0
    return base_conf + (0.03 * contests_detected) + (0.20 * has_qr)


def scan_ballot_image(image_b64: str, template: dict[str, Any]) -> dict[str, Any]:
    img = decode_image_b64(image_b64)
    # Perpendicular camera/document setups may produce 90-degree rotated captures.
    # Evaluate 0/90/270 and keep the highest-confidence decode.
    rotations: list[tuple[int, np.ndarray]] = [
        (0, img),
        (90, cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)),
        (270, cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)),
    ]
    best_deg = 0
    best_result = _scan_ballot_image_once(img, template)
    best_score = _scan_result_quality(best_result)
    for deg, candidate in rotations[1:]:
        result = _scan_ballot_image_once(candidate, template)
        score = _scan_result_quality(result)
        if score > best_score:
            best_score = score
            best_result = result
            best_deg = deg

    bubble = best_result.get("bubbleRead")
    if isinstance(bubble, dict):
        warp_dbg = bubble.get("warpDebug")
        if isinstance(warp_dbg, dict):
            warp_dbg["inputRotationDeg"] = best_deg
        else:
            bubble["warpDebug"] = {"inputRotationDeg": best_deg}
    return best_result
