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
import re

from app.ml_correction import bubble_ml_corrector
from app.ballot_template_v2 import (
    BUBBLE_SPEC,
    LAYOUT_SPEC,
    TIMING_SPEC,
    expected_edge_mark_positions,
)
from app.omr_layout_v1 import (
    CANONICAL_H,
    CANONICAL_W,
    annotate_warped_layout,
    layout_scan_quality,
    reproduce_warped_after_rotation,
    rotate_input,
    run_layout_scan_on_bgr,
    score_bubble_fixed_roi,
    _zone_fiducial_anchor_inv,
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
# These match the v2 printed layout at canonical 900×1272 px (A4 at 96 DPI × 1.134 scale):
#   contestHeaderHeight: 24px CSS → ~27px canonical  (was 36 — too large, bit into row 1)
#   v2RowHeightPx: 40px CSS → ~45px canonical         (was 20 — too small, wrong row slices)
CONTEST_HEADER_SKIP_PX = 28
ROW_HEIGHT_PX = 50  # acts as upper cap; actual = gh/num_rows which is ≤45px in practice

def decode_image_b64(image_b64: str) -> np.ndarray:
    if not image_b64 or not isinstance(image_b64, str):
        raise ValueError("Invalid image_b64 input")

    # Remove data URL prefix if present
    image_b64 = re.sub(r'^data:image\/[a-zA-Z0-9.+-]+;base64,', '', image_b64)

    # Remove whitespace/newlines
    image_b64 = image_b64.strip().replace("\n", "").replace("\r", "")

    try:
        raw = base64.b64decode(image_b64, validate=True)
    except Exception as e:
        raise ValueError(f"Base64 decode failed: {e}")

    if not raw:
        raise ValueError("Decoded image is empty")

    arr = np.frombuffer(raw, dtype=np.uint8)

    im = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    print("DEBUG image_b64 length:", len(image_b64))
    print("Starts with data URL:", image_b64.startswith("data:image"))
    print("Decoded bytes length:", len(raw))

    if im is None:
        raise ValueError("Could not decode image bytes (cv2.imdecode returned None)")

    return im


def parse_ballot_qr_extended(raw: str) -> dict[str, Any] | None:
    """
    QR payload: electionId + (ballotId | ballotToken) required.
    Either `layout` (normalized bubble positions) OR legacy `templateVersion`.
    """
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    eid = obj.get("electionId")
    bid = obj.get("ballotId") or obj.get("ballotToken")
    if not isinstance(eid, str) or not isinstance(bid, str):
        return None
    if not eid.strip() or not bid.strip():
        return None
    if obj.get("layout") is not None:
        return obj
    tv = obj.get("templateVersion")
    if isinstance(tv, str) and tv.strip():
        return obj
    return None


def _parse_ballot_qr_json(raw: str) -> tuple[dict[str, Any] | None, str | None]:
    ext = parse_ballot_qr_extended(raw)
    if ext is not None:
        return ext, raw
    return None, raw


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
        parsed = parse_ballot_qr_extended(raw)
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


# def _detect_contest_top_edges(body_gray: np.ndarray, n_expected: int) -> list[int] | None:
#     """
#     Detect y-positions where each contest block starts by finding the horizontal
#     black border lines that PrintableBallotSheet draws around each contest article.

#     Each contest is wrapped in <article class="border border-neutral-400 print:border-black">.
#     In the warped body image these show up as rows where >50 % of pixels are dark.

#     Returns a sorted list of y-start positions (length == n_expected), or None if
#     detection cannot find exactly n_expected blocks.
#     """
#     h, w = body_gray.shape
#     if h < 20 or w < 20:
#         return None

#     _, inv = cv2.threshold(body_gray, 160, 255, cv2.THRESH_BINARY_INV)
#     # Sum dark pixels per row; ignore outer side margins (timing strips)
#     margin = int(w * 0.05)
#     row_dark = np.sum(inv[:, margin : w - margin] > 128, axis=1)
#     inner_w = w - 2 * margin

#     # A full-width contest border: ≥55 % of inner width is dark in a thin run.
#     threshold = inner_w * 0.55
#     border_mask = (row_dark >= threshold).astype(np.uint8)

#     # Merge adjacent border rows into single events.
#     edges: list[int] = []
#     in_band = False
#     band_start = 0
#     for y in range(h):
#         if border_mask[y] and not in_band:
#             in_band = True
#             band_start = y
#         elif not border_mask[y] and in_band:
#             in_band = False
#             edges.append((band_start + y) // 2)  # midpoint of border band
#     if in_band:
#         edges.append((band_start + h) // 2)

#     # Each contest has a top border; we also get interior dividers (section-bar bottom).
#     # Keep only edges spaced far enough apart to be top-of-contest borders.
#     min_gap = int(h / (n_expected * 3))  # at least 1/3 of expected strip height
#     filtered: list[int] = []
#     last = -min_gap * 2
#     for e in edges:
#         if e - last >= min_gap:
#             filtered.append(e)
#             last = e

#     if len(filtered) == n_expected:
#         return filtered

#     # Tolerate ±1 extra edge (interior section-bar divider or slight noise).
#     if len(filtered) == n_expected + 1:
#         # Drop the extra that is closest to its neighbour.
#         best_drop = 0
#         best_gap = filtered[1] - filtered[0]
#         for i in range(1, len(filtered) - 1):
#             gap = filtered[i + 1] - filtered[i - 1]
#             if gap < best_gap:
#                 best_gap = gap
#                 best_drop = i
#         filtered.pop(best_drop)
#         if len(filtered) == n_expected:
#             return filtered

#     return None


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
    Zones match the robust grid: shallow top band + edge inset so TL/TR do not drift inward.
    """
    prep = preprocess_image(img)
    gray = prep["gray"]
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, inv = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = gray.shape[:2]
    m = int(min(w, h) * 0.18)
    top_band = max(18, int(min(w, h) * 0.11))
    edge_inset = max(2, int(min(w, h) * 0.01))
    zones = {
        "img_tl": ((0, 0, m, top_band), (0.0, 0.0)),
        "img_tr": ((w - m - edge_inset, 0, w - edge_inset, top_band), (float(w - 1), 0.0)),
        "img_br": (
            (w - m - edge_inset, h - m - edge_inset, w - edge_inset, h - edge_inset),
            (float(w - 1), float(h - 1)),
        ),
        "img_bl": ((0, h - m - edge_inset, m, h - edge_inset), (0.0, float(h - 1))),
    }
    found: dict[str, dict[str, Any]] = {}
    for name, ((x0, y0, x1, y1), (ax, ay)) in zones.items():
        c = _zone_fiducial_anchor_inv(inv, x0, y0, x1, y1, ax, ay)
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


# def _normalize_warp_to_paper_bbox(warped: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
#     """
#     After homography, remove side/background padding by re-cropping to the
#     dominant bright paper region, then resize back to canonical size.
#     """
#     h, w = warped.shape[:2]
#     gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
#     # Robust bright-paper mask with fallback threshold.
#     _, m1 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
#     m2 = (gray > 150).astype(np.uint8) * 255
#     mask = cv2.bitwise_or(m1, m2.astype(np.uint8))
#     mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
#     contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
#     if not contours:
#         return warped, {"paper_bbox": (0, 0, w, h), "paper_bbox_confidence": 0.0}
#     min_area = float(h * w) * 0.28
#     best = None
#     best_area = 0.0
#     best_contour = None
#     for c in contours:
#         area = cv2.contourArea(c)
#         if area < min_area:
#             continue
#         x, y, bw, bh = cv2.boundingRect(c)
#         # Prefer tall rectangle near A4 portrait ratio.
#         ratio = bw / max(bh, 1)
#         ratio_penalty = abs(ratio - (210 / 297))
#         score = area * (1.0 - min(0.45, ratio_penalty))
#         if score > best_area:
#             best_area = score
#             best = (x, y, bw, bh, area)
#             best_contour = c
#     if best is None:
#         return warped, {"paper_bbox": (0, 0, w, h), "paper_bbox_confidence": 0.0}
#     x, y, bw, bh, area = best
#     if best_contour is not None:
#         peri = cv2.arcLength(best_contour, True)
#         if peri > 1:
#             approx = cv2.approxPolyDP(best_contour, 0.02 * peri, True)
#             if len(approx) == 4:
#                 quad = approx.reshape(4, 2).astype(np.float32)
#                 s = quad.sum(axis=1)
#                 d = np.diff(quad, axis=1).reshape(-1)
#                 tl = quad[np.argmin(s)]
#                 br = quad[np.argmax(s)]
#                 tr = quad[np.argmin(d)]
#                 bl = quad[np.argmax(d)]
#                 src = np.array([tl, tr, br, bl], dtype=np.float32)
#                 dst = np.array(
#                     [(0, 0), (w - 1, 0), (w - 1, h - 1), (0, h - 1)],
#                     dtype=np.float32,
#                 )
#                 Hq = cv2.getPerspectiveTransform(src, dst)
#                 normalized = cv2.warpPerspective(warped, Hq, (w, h))
#                 conf = float(min(1.0, area / (h * w)))
#                 return normalized, {
#                     "paper_bbox": (int(x), int(y), int(x + bw), int(y + bh)),
#                     "paper_bbox_confidence": conf,
#                     "paper_quad": src.astype(int).tolist(),
#                 }
#     # Keep a tiny safety inset to avoid black desk pixels.
#     pad = 2
#     x0 = max(0, x + pad)
#     y0 = max(0, y + pad)
#     x1 = min(w, x + bw - pad)
#     y1 = min(h, y + bh - pad)
#     if x1 - x0 < w * 0.45 or y1 - y0 < h * 0.65:
#         return warped, {"paper_bbox": (0, 0, w, h), "paper_bbox_confidence": 0.0}
#     cropped = warped[y0:y1, x0:x1]
#     normalized = cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)
#     conf = float(min(1.0, area / (h * w)))
#     return normalized, {"paper_bbox": (int(x0), int(y0), int(x1), int(y1)), "paper_bbox_confidence": conf}


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
    mode = _template_layout_mode(template)

    if mode == "legacy":
        H = _detect_page_outline_homography(img, LAYOUT_SPEC.canonical_w, LAYOUT_SPEC.canonical_h)
        if H is not None:
            warped = cv2.warpPerspective(img, H, (LAYOUT_SPEC.canonical_w, LAYOUT_SPEC.canonical_h))
            return warped, {
                "mode": "legacy",
                "warp_source": "legacy-page-outline",
                "corner_confidence": 0.0,
            }

        warped = warp_if_possible(img)
        return warped, {
            "mode": "legacy",
            "warp_source": "legacy-fiducials",
            "corner_confidence": 0.0,
        }

    fid = detect_corner_fiducials(img)
    found = fid.get("found", {})
    corners: dict[str, tuple[float, float]] = {}

    for zone in ("img_tl", "img_tr", "img_br", "img_bl"):
        if zone in found:
            corners[zone] = tuple(found[zone]["centroid"])

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

    return warped, {
        "mode": mode,
        "warp_source": warp_source,
        "corner_confidence": float(fid.get("confidence") or 0.0),
        "orientation": orient,
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

    weights = []
    for c in contests:
        options = c.get("options") or []
        num_options = len(options)

        if profile["num_cols"] == 1:
            rows = max(1, num_options)
        else:
            candidate_rows = max(1, (num_options + profile["num_cols"] - 1) // profile["num_cols"])
            rows = candidate_rows + 1  # include contest title/header band

        weights.append(rows)

    total_weight = max(sum(weights), 1)

    bounds = []
    acc = 0
    for wv in weights:
        ya = y0 + int(total_h * acc / total_weight)
        acc += wv
        yb = y0 + int(total_h * acc / total_weight)
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


def score_bubbles_from_geometry(
    warped_bgr: np.ndarray, template: dict[str, Any], geometry: dict[str, Any]
) -> dict[str, Any]:
    """
    Score bubbles using measured box geometry from the ballot generator (CSS px, page-relative).
    Scales template page dimensions to the warped image size — no grid inference.
    """
    mode = _template_layout_mode(template)
    contests_spec = template.get("contests") or []
    spec_by_pid = {
        str(c.get("positionId") or ""): c for c in contests_spec if c.get("positionId")
    }

    h, w = warped_bgr.shape[:2]
    page = geometry.get("page") or {}
    pw = float(page.get("width") or 0)
    ph = float(page.get("height") or 0)
    if pw <= 0 or ph <= 0:
        return {
            "raw_scores": {},
            "selectionsByPosition": {},
            "error": "geometry_page_invalid",
            "confidence": 0.0,
        }
    sx = w / pw
    sy = h / ph

    contests_geo = geometry.get("contests") or []
    raw_scores: dict[str, dict[str, float]] = {}
    selections_by_position: dict[str, list[str]] = {}
    contest_conf: list[float] = []
    debug_contests: list[dict[str, Any]] = []

    for cg in contests_geo:
        pid = str(cg.get("positionId") or "")
        bubbles = cg.get("bubbles") or []
        if not pid:
            continue
        spec = spec_by_pid.get(pid) or {}
        max_marks = int(spec.get("maxMarks") or cg.get("maxVotes") or 1)
        scores: dict[str, float] = {}
        bubble_dbg: list[dict[str, Any]] = []
        xs0_all: list[int] = []
        ys0_all: list[int] = []
        xs1_all: list[int] = []
        ys1_all: list[int] = []

        for b in bubbles:
            oid = str(b.get("optionId") or "")
            if not oid:
                continue
            xf = float(b.get("x") or 0)
            yf = float(b.get("y") or 0)
            wf = float(b.get("w") or 0)
            hf = float(b.get("h") or 0)
            x0 = int(xf * sx)
            y0 = int(yf * sy)
            x1 = int((xf + wf) * sx)
            y1 = int((yf + hf) * sy)
            x0 = max(0, min(w - 1, x0))
            x1 = max(x0 + 1, min(w, x1))
            y0 = max(0, min(h - 1, y0))
            y1 = max(y0 + 1, min(h, y1))
            # The geometry cell is the EXACT bubble element bounding box (~15px CSS circle).
            # Pad around it so the ring/bg masks (up to 2.2× bubble radius) can sample
            # context outside the bubble, and the cell passes the minimum size check.
            bub_half = max(4, ((x1 - x0) + (y1 - y0)) // 4)
            pad = bub_half + 6
            px0 = max(0, x0 - pad)
            py0 = max(0, y0 - pad)
            px1 = min(w, x1 + pad)
            py1 = min(h, y1 + pad)
            cell = warped_bgr[py0:py1, px0:px1]
            pw_cell = px1 - px0
            ph_cell = py1 - py0
            # Bubble center within the padded crop (middle of original exact bounds).
            cx_r = ((x0 + x1) / 2.0 - px0) / max(1, pw_cell)
            cy_r = ((y0 + y1) / 2.0 - py0) / max(1, ph_cell)
            sc = _score_bubble_v2(cell, center_x_ratio=cx_r, center_y_ratio=cy_r) if cell.size else 0.0
            scores[oid] = sc
            bubble_dbg.append(
                {
                    "optionId": oid,
                    "cell": (x0, y0, x1, y1),  # original bubble bounds for overlay
                    "score": sc,
                }
            )
            xs0_all.append(x0)
            ys0_all.append(y0)
            xs1_all.append(x1)
            ys1_all.append(y1)

        raw_scores[pid] = scores
        picks, meta = _validate_contest_marks_v2(
            scores,
            max_marks,
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

        rx0, ry0, rx1, ry1 = 0, 0, w, h
        if xs0_all:
            rx0, ry0 = min(xs0_all), min(ys0_all)
            rx1, ry1 = max(xs1_all), max(ys1_all)
        hdr_y = ry0
        debug_contests.append(
            {
                "positionId": pid,
                "rect": (rx0, ry0, rx1, ry1),
                "header_y": hdr_y,
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
        "contestsInTemplate": len(contests_geo),
        "debug": {
            "source": "geometry",
            "regions": {"content_rect": (0, 0, w, h), "contests": []},
            "contests": debug_contests,
        },
    }


# CSS layout constants for v2 3-column print ballot (from PrintableBallotSheet SCAN_GEOMETRY).
_V2_CSS_ROW_H: float = 40.0       # v2RowHeightPx (print CSS px per candidate row)
_V2_CSS_NUM_W: float = 32.0        # v2NumWidthPx  (number column width in CSS px)
_V2_CSS_BUBBLE_SZ: float = 15.0    # v2BubbleSizePx (bubble circle element CSS px)
_V2_CSS_HEADER_H: float = 20.0     # contestHeaderHeight print:min-h-[20px]
_V2_CSS_GAP: float = 8.0           # space-y-2 inter-contest vertical gap
_V2_NUM_COLS: int = 3              # columns per row in v2 3-column grid


def _compute_analytical_geometry_v2(
    template: dict[str, Any], w: int, h: int
) -> dict[str, Any] | None:
    """
    Compute exact bubble bounding boxes from v2 CSS layout constants + canonical scale.

    The proportional grid in map_template_regions() distributes contest strips by row-weight,
    which is inaccurate when contests have different option counts.  This function accumulates
    exact CSS heights and maps them to canonical pixel coords via scale_y = contest_area / total_css.
    No layout inference — positions come from the CSS table structure directly.

    Key v2 layout facts (from PrintableBallotSheet.tsx):
    - Candidates are chunked 3-per-row (outer table: 3 cols of 33.33% each).
    - ABSTAIN is a SEPARATE <tr> always in column 0, placed after all candidate rows.
    - scale_y is derived from contest height; horizontal offset uses empirical 0.19 ratio.

    Returns a geometry dict with page={width:w, height:h} so score_bubbles_from_geometry
    applies sx=sy=1.0 (coordinates are canonical pixels already).
    Returns None if contests are missing or image dimensions are zero.
    """
    contests = template.get("contests") or []
    if not contests or w <= 0 or h <= 0:
        return None

    def _contest_css_h(c: dict[str, Any]) -> float:
        opts = c.get("options") or []
        candidates = [o for o in opts if not _is_abstain_option(str(o.get("optionId") or ""))]
        has_abstain = len(candidates) < len(opts)
        n_cand_rows = max(1, (len(candidates) + _V2_NUM_COLS - 1) // _V2_NUM_COLS)
        n_total_rows = n_cand_rows + (1 if has_abstain else 0)
        return _V2_CSS_HEADER_H + n_total_rows * _V2_CSS_ROW_H

    total_css_h = sum(_contest_css_h(c) for c in contests) + max(0, len(contests) - 1) * _V2_CSS_GAP
    if total_css_h <= 0:
        return None

    # Canonical contest strip boundaries (pixels).
    cy0 = LAYOUT_SPEC.contests_y0 * h
    cy1 = LAYOUT_SPEC.contests_y1 * h
    can_h = cy1 - cy0
    if can_h <= 0:
        return None

    # Vertical scale: derived dynamically from total CSS height vs canonical contest area.
    scale_y = can_h / total_css_h

    # Column 0 bubble CENTER in canonical pixels.
    # LAYOUT_SPEC.content_x0 * w is empirically calibrated to the col-0 bubble center directly
    # (≈94.5px for 900px canonical width) — NOT the column left edge.
    col0_bub_cx = LAYOUT_SPEC.content_x0 * w

    # Column width from CSS: (scan_frame_w − 88px) / 3, scaled to canonical.
    # Derived from A4 print layout: col_w ≈ w * 0.3022 ≈ 272px at 900px canonical.
    col_w = w * 0.3022

    # Bubble half-size: fixed 8px canonical (≈15px CSS bubble at 1.336 scale).
    bub_half = 8.0

    om_contests: list[dict[str, Any]] = []
    y_cur = cy0

    for i, contest in enumerate(contests):
        if i > 0:
            y_cur += _V2_CSS_GAP * scale_y
        pid = str(contest.get("positionId") or "")
        label = str(contest.get("positionName") or pid)
        max_marks = int(contest.get("maxMarks") or 1)
        options = contest.get("options") or []

        # Separate candidates from abstain (abstain is always in its own row at col 0).
        candidate_opts = [o for o in options if not _is_abstain_option(str(o.get("optionId") or ""))]
        abstain_opts = [o for o in options if _is_abstain_option(str(o.get("optionId") or ""))]
        n_cand_rows = max(1, (len(candidate_opts) + _V2_NUM_COLS - 1) // _V2_NUM_COLS)

        y_cur += _V2_CSS_HEADER_H * scale_y  # advance past contest header row

        bubbles: list[dict[str, Any]] = []

        # Candidates: 3-column row-major grid (col 0/1/2, then next row).
        for j, opt in enumerate(candidate_opts):
            oid = str(opt.get("optionId") or "")
            olabel = str(opt.get("label") or oid)
            row = j // _V2_NUM_COLS
            col = j % _V2_NUM_COLS
            row_cy = y_cur + (row + 0.5) * _V2_CSS_ROW_H * scale_y
            bub_cx = col0_bub_cx + col * col_w
            bubbles.append({
                "optionId": oid,
                "label": olabel,
                "x": bub_cx - bub_half,
                "y": row_cy - bub_half,
                "w": bub_half * 2.0,
                "h": bub_half * 2.0,
            })

        y_cur += n_cand_rows * _V2_CSS_ROW_H * scale_y  # advance past all candidate rows

        # Abstain: always column 0, its own row after candidates.
        for opt in abstain_opts:
            oid = str(opt.get("optionId") or "")
            olabel = str(opt.get("label") or oid)
            row_cy = y_cur + 0.5 * _V2_CSS_ROW_H * scale_y
            bub_cx = col0_bub_cx  # column 0
            bubbles.append({
                "optionId": oid,
                "label": olabel,
                "x": bub_cx - bub_half,
                "y": row_cy - bub_half,
                "w": bub_half * 2.0,
                "h": bub_half * 2.0,
            })
            y_cur += _V2_CSS_ROW_H * scale_y  # one row per abstain option

        om_contests.append({
            "positionId": pid,
            "label": label,
            "maxVotes": max_marks,
            "bubbles": bubbles,
        })

    return {
        "templateId": "analytical-v2",
        "page": {"width": w, "height": h},
        "contests": om_contests,
    }


def score_bubbles_v2(warped_bgr: np.ndarray, template: dict[str, Any]) -> dict[str, Any]:
    geom = template.get("geometry")
    if isinstance(geom, dict) and isinstance(geom.get("page"), dict):
        return score_bubbles_from_geometry(warped_bgr, template, geom)

    mode = _template_layout_mode(template)

    # For v2 ballots without DOM-measured geometry, compute exact positions analytically
    # from CSS layout constants instead of using the imprecise proportional grid.
    if mode == "v2":
        h_img, w_img = warped_bgr.shape[:2]
        analytical_geom = _compute_analytical_geometry_v2(template, w_img, h_img)
        if analytical_geom is not None:
            return score_bubbles_from_geometry(warped_bgr, template, analytical_geom)

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
                # v2 3-col cell layout: [num(32px CSS)][bubble(15px CSS)][name].
                # Bubble center ≈ (32 + 7.5) / (col_w - 2*pad_x) ≈ 0.19 of cell width.
                sc = _score_bubble_v2(cell, center_x_ratio=0.19)
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

def debug_annotate_ballot(
    warped_bgr: np.ndarray,
    template: dict[str, Any],
    bubble_result: dict[str, Any],
) -> np.ndarray:
    print("ENTERED debug_annotate_ballot")
    print("WARPED SHAPE:", warped_bgr.shape)

    contests: list[dict[str, Any]] = template.get("contests") or []
    print("TEMPLATE FIRST CONTEST:", contests[0] if contests else None)
    print("TEMPLATE FIRST BUBBLE:", contests[0].get("bubbles", [None])[0] if contests else None)

    layout_dbg = bubble_result.get("layoutDebug")
    print("HAS layoutDebug:", isinstance(layout_dbg, list), "len=", len(layout_dbg) if isinstance(layout_dbg, list) else None)

    if isinstance(layout_dbg, list) and len(layout_dbg) > 0:
        sel = bubble_result.get("selectionsByPosition") or {}
        return annotate_warped_layout(warped_bgr, layout_dbg, sel)

    canvas = warped_bgr.copy()
    H, W = canvas.shape[:2]

    dbg = bubble_result.get("debug") if isinstance(bubble_result, dict) else None
    # v2 overlay path: use template-mapped regions and scored bubble cells directly.

    # Use contest geometry already provided by template/layout.
    n_template = len(contests)
    contest_y_bounds: list[tuple[int, int]] = []
    contests_to_read: list[int] = []

    for idx, contest in enumerate(contests):
        y0_rel = contest.get("y0")
        y1_rel = contest.get("y1")

        if y0_rel is None or y1_rel is None:
            continue

        contest_y_bounds.append((int(y0_rel), int(y1_rel)))
        contests_to_read.append(idx)

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
    top_skip = int(H * LAYOUT_SPEC.contests_y0)
    y_body1 = int(H * LAYOUT_SPEC.content_y1)
    if y_body1 <= top_skip + 80:
        top_skip = int(H * 0.10)
        y_body1 = int(H * 0.97)

    bh = y_body1 - top_skip
    side_margin = int(W * LAYOUT_SPEC.content_x0)
    content_x0 = side_margin
    content_w = int(W * (LAYOUT_SPEC.content_x1 - LAYOUT_SPEC.content_x0))
    col_w = content_w // 3

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

    # Overlay key (drawn once; must not live inside per-bubble loop or legend is unset when bubbles=[]).
    legend: list[tuple[tuple[int, int, int], str]] = [
        ((0, 255, 0), "Picked mark"),
        ((0, 220, 255), "Above threshold"),
        ((60, 60, 255), "Below threshold"),
        ((0, 0, 255), "Skip zone"),
        ((0, 140, 255), "Side margin"),
        ((255, 200, 0), "Column divider"),
        ((0, 255, 80), "Fiducial detected"),
        ((0, 0, 220), "Fiducial NOT found"),
    ]

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

        contest_scores: dict[str, Any] = raw_scores.get(pid) or {}
        picked: list[str] = selections.get(pid) or []

        for bubble in contest.get("bubbles", []):
            bx = int(bubble["x"])
            by_ = int(bubble["y"])
            br = int(min(bubble.get("w", 20), bubble.get("h", 20)) / 2)
            oid = bubble["optionId"]

            score_val = float(contest_scores.get(oid) or 0.0)
            is_picked = oid in picked

            if is_picked:
                cv2.circle(canvas, (bx, by_), br, (0, 255, 0), -1)
            elif score_val >= 0.075:
                cv2.circle(canvas, (bx, by_), br, (0, 220, 255), 2)
            else:
                cv2.circle(canvas, (bx, by_), br, (60, 60, 255), 1)

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


def _finalize_layout_scan_result(res: dict[str, Any], rotation_deg: int) -> dict[str, Any]:
    """Shape worker output for gateway; `bubbleRead` matches prior keys + layout-v1 fields."""
    wmeta = dict(res.get("warpMeta") or {})
    wmeta["inputRotationDeg"] = rotation_deg
    wmeta["canonicalWidth"] = CANONICAL_W
    wmeta["canonicalHeight"] = CANONICAL_H
    bubble = dict(res.get("bubbleRead") or {})
    bubble["warpDebug"] = wmeta
    if res.get("qrDebug") is not None:
        bubble["qrDebug"] = res["qrDebug"]
    sel_flat: dict[str, str] = {}
    by_pos = dict(res.get("selectionsByPosition") or {})
    bubble["selectionsByPosition"] = by_pos
    for k, ids in by_pos.items():
        if not ids:
            continue
        sel_flat[k] = ids[0] if len(ids) == 1 else ",".join(str(x) for x in ids)
    ballot_id = res.get("ballotId")
    election_id = res.get("electionId")
    conf = bubble.get("confidence")
    conf_f = float(conf) if isinstance(conf, (int, float)) else 0.0
    warp_applied = bool(wmeta.get("fiducial_warp", True))
    return {
        "qr": res.get("qr"),
        "qrRaw": res.get("qrRaw"),
        "bubbleRead": bubble,
        "selectionsByPosition": by_pos,
        "rawBubbleScores": res.get("rawBubbleScores") or {},
        "selectionsFlat": selections_multi_to_flat(by_pos),
        "warpApplied": warp_applied,
        "ballotId": ballot_id,
        "electionId": election_id,
        "layoutResult": {
            "ballotId": ballot_id,
            "electionId": election_id,
            "selections": sel_flat,
            "confidence": conf_f,
        },
    }


def _scan_ballot_image_once(img: np.ndarray, template: dict[str, Any]) -> dict[str, Any]:
    """
    Fiducial-only warp → canonical 1000×1400 → QR layout (0–1) → local ROI fill.
    Evaluates input rotations 0° / 90° / 270° deterministically; picks best composite score.
    """
    best_q = -1e18
    best_res: dict[str, Any] | None = None
    best_deg = 0
    for deg in (0, 90, 270):
        rotated = rotate_input(img, deg)
        res = run_layout_scan_on_bgr(
            rotated,
            template,
            detect_corner_fiducials,
            compute_homography,
            parse_ballot_qr_extended,
        )
        q = layout_scan_quality(res)
        if q > best_q:
            best_q = q
            best_res = res
            best_deg = deg
    assert best_res is not None
    return _finalize_layout_scan_result(best_res, best_deg)


def _detect_qr_corner_position(img: np.ndarray) -> dict[str, Any]:
    """
    Lightweight QR detector that returns the QR code's normalized center position
    within `img`.  Does NOT run the full scan pipeline.

    Returns:
        has_qr      – QR was physically detected (even if not decoded)
        qr_corner_ok – QR center is in bottom-right corner (cx > 0.7, cy > 0.7)
        cx_ratio, cy_ratio – normalized center coordinates (None if not found)
    """
    det = cv2.QRCodeDetector()
    h, w = img.shape[:2]

    def _try(
        v: np.ndarray, x_off: int = 0, y_off: int = 0, sx: float = 1.0, sy: float = 1.0
    ) -> tuple[bool, float, float]:
        ok, pts = det.detect(v)
        if not ok or pts is None:
            return False, 0.0, 0.0
        flat = pts.reshape(-1, 2)
        cx = float(np.mean(flat[:, 0])) * sx + x_off
        cy = float(np.mean(flat[:, 1])) * sy + y_off
        return True, cx / w, cy / h

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Full image as-is
    found, cx_r, cy_r = _try(img)
    if found:
        return {"has_qr": True, "qr_corner_ok": cx_r > 0.7 and cy_r > 0.7, "cx_ratio": cx_r, "cy_ratio": cy_r}

    # 2. Downscaled (phones / high-res captures)
    m = max(h, w)
    if m > 1800:
        s = 1600 / m
        small = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        found, cx_r, cy_r = _try(small, sx=1.0 / s, sy=1.0 / s)
        if found:
            return {"has_qr": True, "qr_corner_ok": cx_r > 0.7 and cy_r > 0.7, "cx_ratio": cx_r, "cy_ratio": cy_r}

    # 3. CLAHE contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)
    found, cx_r, cy_r = _try(enhanced)
    if found:
        return {"has_qr": True, "qr_corner_ok": cx_r > 0.7 and cy_r > 0.7, "cx_ratio": cx_r, "cy_ratio": cy_r}

    # 4. Bottom-right crop (2× upscale for small QR codes)
    x0c, y0c = int(w * 0.5), int(h * 0.55)
    crop = img[y0c:h, x0c:w]
    if crop.size > 0:
        crop2 = cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        ch, cw = crop.shape[:2]
        found, cx_r, cy_r = _try(crop2, x_off=x0c, y_off=y0c, sx=cw / crop2.shape[1], sy=ch / crop2.shape[0])
        if found:
            return {"has_qr": True, "qr_corner_ok": cx_r > 0.7 and cy_r > 0.7, "cx_ratio": cx_r, "cy_ratio": cy_r}

    return {"has_qr": False, "qr_corner_ok": False, "cx_ratio": None, "cy_ratio": None}


def _scan_result_quality(result: dict[str, Any], qr_pos: dict[str, Any] | None = None) -> float:
    """
    Fallback scoring used only when no rotation passes the QR corner check.

    Scoring rules:
    - Base: mean bubble-classification confidence
    - Strong reward if QR decoded successfully (+0.40)
    - Strong reward if QR is near bottom-right corner (+0.50)
    - Heavy penalty for invalid contests (over-voted) (-0.30 each)
    - No blind reward for number of detected contests
    """
    bubble = (result.get("bubbleRead") or {}) if isinstance(result, dict) else {}
    confidence = bubble.get("confidence")
    if isinstance(confidence, dict):
        vals = [float(v) for v in confidence.values() if isinstance(v, (int, float))]
        base_conf = float(np.mean(vals)) if vals else 0.0
    else:
        base_conf = float(confidence or 0.0)

    has_qr = bool(result.get("qr"))
    qr_corner_ok = bool(qr_pos and qr_pos.get("qr_corner_ok"))

    score = base_conf
    score += 0.40 if has_qr else 0.0
    score += 0.50 if qr_corner_ok else 0.0
    return score


def _attach_input_rotation(result: dict[str, Any], deg: int) -> None:
    bubble = result.get("bubbleRead")
    if isinstance(bubble, dict):
        warp_dbg = bubble.get("warpDebug")
        if isinstance(warp_dbg, dict):
            warp_dbg["inputRotationDeg"] = deg
        else:
            bubble["warpDebug"] = {"inputRotationDeg": deg}


def _log_template_contest_ids(template: dict[str, Any] | None, label: str) -> None:
    if not template:
        print("WORKER TEMPLATE CONTEST IDS:", [])
        print(f"{label}: <no template>")
        return
    top = template.get("contests") or []
    print(
        "WORKER TEMPLATE CONTEST IDS:",
        [c.get("positionId") or c.get("id") for c in top if isinstance(c, dict)],
    )
    geom = template.get("geometry")
    contests: list[Any] = []
    if isinstance(geom, dict):
        contests = list(geom.get("contests") or [])
    if not contests:
        contests = list(top)
    ids = [
        str(c.get("positionId") or c.get("id") or "")
        for c in contests
        if isinstance(c, dict)
    ]
    print(f"{label}: {[x for x in ids if x]}")


def scan_ballot_image_with_warp(
    image_b64: str, template: dict[str, Any] | None = None
) -> tuple[dict[str, Any], np.ndarray | None]:
    """
    Like scan_ballot_image but returns the v2 warped BGR canvas when the gateway
    pipeline succeeds (for debug overlay parity).
    When GATEWAY_URL is set, the v2 path uses only /api/omr-layout — we do not
    fall back to the client template (often election-wide and wrong per ballot).
    Set OMR_ALLOW_TEMPLATE_FALLBACK=1 to restore legacy fallback.
    """
    import os

    gateway_url = os.getenv("GATEWAY_URL", "").rstrip("/")
    img = decode_image_b64(image_b64)
    if gateway_url:
        print(
            "WORKER: client template (if present) is not used for contests when "
            "GATEWAY_URL is set; layout + AUTO FILTERED CONTEST IDS come from GET /api/omr-layout"
        )
    _log_template_contest_ids(template, "WORKER TEMPLATE CONTEST IDS (client payload advisory)")
    if gateway_url:
        result, warped = _scan_ballot_image_v2(img, gateway_url)
        if result.get("ok"):
            return result, warped
        allow_fb = os.getenv("OMR_ALLOW_TEMPLATE_FALLBACK", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        if allow_fb:
            print(
                "WORKER: v2 failed; OMR_ALLOW_TEMPLATE_FALLBACK=1 — using template pipeline"
            )
            return _scan_ballot_image_once(img, template or {}), None
        print(
            "WORKER: v2 failed; returning error (no election-wide template fallback). "
            "Fix QR/layout/hash or set OMR_ALLOW_TEMPLATE_FALLBACK=1 for dev only."
        )
        return result, warped
    return _scan_ballot_image_once(img, template or {}), None


def scan_ballot_image(image_b64: str, template: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Main entry point for ballot scanning.

    When GATEWAY_URL env var is set the new pipeline runs:
      decode image → try rotations 0°/90°/270° → warp → decode QR
      → fetch layout from gateway → verify hash → fixed-ROI bubble scoring → return clean result.

    Falls back to the old template-based pipeline if GATEWAY_URL is not set or the
    new pipeline fails to find the QR / fetch the layout.
    """
    r, _ = scan_ballot_image_with_warp(image_b64, template)
    return r


# ─── V2 Pipeline (QR → fetch layout from gateway) ────────────────────────────

def _fetch_ballot_layout(ballot_id: str, gateway_url: str) -> dict[str, Any] | None:
    """
    GET {gateway_url}/api/omr-layout/{ballot_id}
    Returns the parsed JSON record or None on any error.
    Uses stdlib urllib so no extra dependencies are required.
    """
    import urllib.request
    import urllib.error
    url = f"{gateway_url}/api/omr-layout/{ballot_id}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        return None
    except Exception:
        return None


def _verify_layout_hash(stored_hash: str, qr_hash: str) -> bool:
    """
    Compare the hash stored in the gateway against the hash from the QR payload.
    Both are sha256 hex strings (with or without 'sha256:' prefix).
    Returns True if either value is missing (hash is advisory, not blocking when absent).
    """
    if not stored_hash or not qr_hash:
        return True
    def _strip(h: str) -> str:
        return h.replace("sha256:", "").strip().lower()
    return _strip(stored_hash) == _strip(qr_hash)


BUBBLE_FILL_THRESHOLD = 0.45  # circular ROI ink score → filled


def _score_bubbles_v3(
    warped: np.ndarray,
    layout: dict[str, Any],
) -> dict[str, Any]:
    """
    Score bubbles from layout geometry: normalized center (nx,ny) then warped pixels;
    fixed circular ROI + optional ±2 px (score_bubble_fixed_roi).

    layout: { page: {width, height}, contests: [...] }
    """
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    h_img, w_img = warped.shape[:2]

    page = layout.get("page") or {}
    pw = float(page.get("width") or CANONICAL_W)
    ph = float(page.get("height") or CANONICAL_H)
    if pw <= 0 or ph <= 0:
        return {"selectionsByPosition": {}, "rawBubbleScores": {}, "confidence": 0.0,
                "error": "layout_page_invalid", "bubbleOverlay": []}

    selections: dict[str, list[str]] = {}
    raw_scores: dict[str, dict[str, float]] = {}
    contest_confs: list[float] = []
    bubble_overlay: list[dict[str, Any]] = []

    for contest in (layout.get("contests") or []):
        pid = str(contest.get("positionId") or "")
        if not pid:
            continue
        max_votes = int(contest.get("maxVotes") or 1)
        scores: dict[str, float] = {}

        for bubble in (contest.get("bubbles") or []):
            oid = str(bubble.get("optionId") or "")
            if not oid:
                continue
            xf = float(bubble.get("x") or 0)
            yf = float(bubble.get("y") or 0)
            wf = float(bubble.get("w") or 0)
            hf = float(bubble.get("h") or 0)
            if wf > 1e-9 or hf > 1e-9:
                nx = (xf + wf / 2.0) / pw
                ny = (yf + hf / 2.0) / ph
            else:
                nx, ny = xf, yf
            nx = max(0.0, min(1.0, nx))
            ny = max(0.0, min(1.0, ny))
            ex = int(round(max(0, min(w_img - 1, nx * w_img))))
            ey = int(round(max(0, min(h_img - 1, ny * h_img))))
            sc, rx, ry = score_bubble_fixed_roi(gray, ex, ey)
            scores[oid] = sc
            bubble_overlay.append(
                {
                    "positionId": pid,
                    "optionId": oid,
                    "expected": [ex, ey],
                    "evaluated": [rx, ry],
                    "score": sc,
                }
            )

        raw_scores[pid] = scores

        # Select filled bubbles: score > threshold, take top max_votes by score
        filled = [(oid, sc) for oid, sc in scores.items() if sc >= BUBBLE_FILL_THRESHOLD]
        filled.sort(key=lambda kv: -kv[1])
        picks = [oid for oid, _ in filled[:max_votes]]

        # Abstain conflict: if ABSTAIN + candidate both selected, clear
        has_abs = any(_is_abstain_option(x) for x in picks)
        has_cand = any(not _is_abstain_option(x) for x in picks)
        if has_abs and has_cand:
            picks = []

        selections[pid] = picks

        vals = list(scores.values())
        if vals:
            top = max(vals)
            med = float(np.median(vals))
            contest_confs.append(min(1.0, max(0.0, (top - med) * 3.0)))
        else:
            contest_confs.append(0.0)

    overall = float(np.mean(contest_confs)) if contest_confs else 0.0
    return {
        "selectionsByPosition": selections,
        "rawBubbleScores": raw_scores,
        "confidence": overall,
        "bubbleOverlay": bubble_overlay,
    }


def _scan_ballot_image_v2(
    img: np.ndarray, gateway_url: str
) -> tuple[dict[str, Any], np.ndarray | None]:
    """
    1. Try rotations 0°, 90°, 270°: fiducial warp + QR on warped canvas; pick best composite score.
    2. Decode QR → ballotId, layoutHash.
    3. Fetch layout, verify hash, score bubbles (fixed circular ROI).
    Returns (result_dict, warped_bgr_or_None) — same warped image for debug overlay.
    """
    from app.omr_layout_v1 import (
        apply_corner_fiducial_warp_only,
        decode_qr_on_warped,
        rotate_input,
    )

    def _ballot_id_from_qr(q: Any) -> str:
        if not isinstance(q, dict):
            return ""
        return str(q.get("ballotId") or q.get("ballotToken") or "").strip()

    best: tuple[float, int, np.ndarray, dict[str, Any], Any, str | None, float, dict] | None = None
    for deg in (0, 90, 270):
        rotated = rotate_input(img, deg)
        warped_try, wmeta_try = apply_corner_fiducial_warp_only(
            rotated, detect_corner_fiducials, compute_homography
        )
        if warped_try is None:
            continue
        qr_obj, qr_raw, qr_conf, qr_dbg = decode_qr_on_warped(
            warped_try, parse_ballot_qr_extended
        )
        fid_c = float(wmeta_try.get("corner_confidence") or 0.0)
        bid = _ballot_id_from_qr(qr_obj)
        has_bid = 1.0 if bid else 0.0
        qconf = float(qr_conf or 0.0)
        composite = has_bid * 500.0 + qconf * 80.0 + fid_c
        if best is None or composite > best[0]:
            best = (
                composite,
                deg,
                warped_try,
                wmeta_try,
                qr_obj,
                qr_raw,
                qconf,
                qr_dbg,
            )

    if best is None:
        return (
            {"ok": False, "error": "warp_failed", "warpMeta": {}},
            None,
        )

    _score, best_deg, warped, wmeta, qr_obj, qr_raw, qr_conf, qr_dbg = best

    if not isinstance(qr_obj, dict):
        return (
            {
                "ok": False,
                "error": "qr_decode_failed",
                "warpMeta": wmeta,
                "inputRotationDeg": best_deg,
            },
            warped,
        )

    ballot_id = _ballot_id_from_qr(qr_obj)
    election_id = str(qr_obj.get("electionId") or "").strip()
    template_id = str(qr_obj.get("templateId") or "").strip()
    qr_layout_hash = str(qr_obj.get("layoutHash") or "").strip()

    if not ballot_id:
        return (
            {"ok": False, "error": "no_ballot_id_in_qr", "qr": qr_obj,
             "inputRotationDeg": best_deg},
            warped,
        )

    layout_record = _fetch_ballot_layout(ballot_id, gateway_url)
    if layout_record is None:
        return (
            {"ok": False, "error": "layout_not_found", "ballotId": ballot_id,
             "inputRotationDeg": best_deg},
            warped,
        )

    stored_hash = str(layout_record.get("layoutHash") or "")
    if not _verify_layout_hash(stored_hash, qr_layout_hash):
        return (
            {"ok": False, "error": "layout_hash_mismatch", "ballotId": ballot_id,
             "inputRotationDeg": best_deg},
            warped,
        )

    layout = layout_record.get("layout")
    if not isinstance(layout, dict):
        return (
            {
                "ok": False,
                "error": "layout_invalid",
                "ballotId": ballot_id,
                "inputRotationDeg": best_deg,
            },
            warped,
        )

    _lc = layout.get("contests") or []
    _acct = str(layout_record.get("academicOrg") or "").strip()
    if _acct:
        print("AUTO ORG (from issuance / GET omr-layout):", _acct)
    _fc = [
        str(c.get("positionId") or c.get("id") or "")
        for c in _lc
        if isinstance(c, dict) and (c.get("positionId") or c.get("id"))
    ]
    print("AUTO FILTERED CONTEST IDS (stored layout):", _fc)

    bubble_result = _score_bubbles_v3(warped, layout)

    by_pos = bubble_result.get("selectionsByPosition") or {}
    selections_flat = selections_multi_to_flat(by_pos)
    bub_conf = float(bubble_result.get("confidence") or 0.0)
    overall_conf = max(0.0, min(1.0, bub_conf * 0.7 + qr_conf * 0.3))

    resolved_election_id = election_id or str(layout_record.get("electionId") or "")
    resolved_template_id = template_id or str(layout_record.get("templateId") or "")

    warp_debug = dict(wmeta)
    warp_debug["inputRotationDeg"] = best_deg
    warp_applied = bool(wmeta.get("fiducial_warp", True))

    return (
        {
            "ok": True,
            "ballotId": ballot_id,
            "electionId": resolved_election_id,
            "templateId": resolved_template_id,
            "selections": selections_flat,
            "confidence": overall_conf,
            "qr": qr_obj,
            "qrRaw": qr_raw,
            "qrDecodeConfidence": qr_conf,
            "qrDebug": qr_dbg,
            "selectionsByPosition": by_pos,
            "rawBubbleScores": bubble_result.get("rawBubbleScores") or {},
            "selectionsFlat": selections_flat,
            "warpApplied": warp_applied,
            "bubbleRead": {
                "pipeline": "layout-v2-gateway",
                "confidence": overall_conf,
                "warpDebug": warp_debug,
                "contestsDetected": len(by_pos),
                "contestsInTemplate": len((layout.get("contests") or [])),
                "selectionsByPosition": by_pos,
                "bubbleOverlay": bubble_result.get("bubbleOverlay") or [],
                "error": None,
            },
            "layoutResult": {
                "ballotId": ballot_id,
                "electionId": resolved_election_id,
                "templateId": resolved_template_id,
                "selections": selections_flat,
                "confidence": overall_conf,
            },
        },
        warped,
    )


def _debug_annotate_v2(
    warped: np.ndarray,
    layout: dict[str, Any],
    bubble_result: dict[str, Any],
) -> np.ndarray:
    """Same warped canvas as scan: blue expected, green/red at evaluated, yellow tie line if refined."""
    canvas = warped.copy()
    h_img, w_img = canvas.shape[:2]

    page = layout.get("page") or {}
    pw = float(page.get("width") or CANONICAL_W)
    ph = float(page.get("height") or CANONICAL_H)

    br = bubble_result.get("bubbleRead") or {}
    selections: dict[str, list[str]] = (
        bubble_result.get("selectionsByPosition") or br.get("selectionsByPosition") or {}
    )
    raw_scores: dict[str, dict[str, float]] = bubble_result.get("rawBubbleScores") or {}
    overlay_list = br.get("bubbleOverlay") or bubble_result.get("bubbleOverlay") or []
    overlay_by = {
        (str(r.get("positionId")), str(r.get("optionId"))): r
        for r in overlay_list
        if r.get("positionId") is not None and r.get("optionId") is not None
    }

    bub_r = max(6, int(7.5 * min(w_img / pw, h_img / ph)))

    for contest in (layout.get("contests") or []):
        pid = str(contest.get("positionId") or "")
        filled_set = set(selections.get(pid) or [])
        scores = raw_scores.get(pid) or {}
        for bubble in (contest.get("bubbles") or []):
            oid = str(bubble.get("optionId") or "")
            row = overlay_by.get((pid, oid))
            if row:
                ex, ey = int(row["expected"][0]), int(row["expected"][1])
                rx, ry = int(row["evaluated"][0]), int(row["evaluated"][1])
                # BGR: expected center = blue ring + small inner dot; refined offset = yellow line
                cv2.circle(canvas, (ex, ey), bub_r, (255, 0, 0), 2)
                cv2.circle(canvas, (ex, ey), 3, (255, 100, 0), -1)
                if (ex, ey) != (rx, ry):
                    cv2.line(canvas, (ex, ey), (rx, ry), (0, 255, 255), 1)
                cx, cy = rx, ry
            else:
                xf = float(bubble.get("x") or 0)
                yf = float(bubble.get("y") or 0)
                wf = float(bubble.get("w") or 0)
                hf = float(bubble.get("h") or 0)
                if wf > 1e-9 or hf > 1e-9:
                    nx = (xf + wf / 2.0) / pw
                    ny = (yf + hf / 2.0) / ph
                else:
                    nx, ny = xf, yf
                nx = max(0.0, min(1.0, nx))
                ny = max(0.0, min(1.0, ny))
                ex = int(round(max(0, min(w_img - 1, nx * w_img))))
                ey = int(round(max(0, min(h_img - 1, ny * h_img))))
                cv2.circle(canvas, (ex, ey), bub_r, (255, 0, 0), 2)
                cv2.circle(canvas, (ex, ey), 3, (255, 100, 0), -1)
                cx, cy = ex, ey
            score = float(scores.get(oid) or 0.0)
            if oid in filled_set:
                cv2.circle(canvas, (cx, cy), bub_r, (0, 255, 0), -1)
                cv2.circle(canvas, (cx, cy), bub_r, (0, 200, 0), 2)
            elif score >= BUBBLE_FILL_THRESHOLD * 0.7:
                cv2.circle(canvas, (cx, cy), bub_r, (0, 220, 255), 2)
            else:
                cv2.circle(canvas, (cx, cy), bub_r, (60, 60, 255), 1)
            cv2.putText(canvas, f"{score:.2f}", (cx + bub_r + 2, cy + 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.22, (200, 200, 200), 1, cv2.LINE_AA)

    legend = [
        ((255, 0, 0), "Expected (geometry)"),
        ((0, 255, 255), "Refine offset"),
        ((0, 255, 0), "Filled (evaluated)"),
        ((0, 220, 255), "Near threshold"),
        ((60, 60, 255), "Blank"),
    ]
    lx, ly = 4, h_img - 4 - len(legend) * 14
    for lc, lt in legend:
        cv2.rectangle(canvas, (lx, ly), (lx + 10, ly + 10), lc, -1)
        cv2.putText(canvas, lt, (lx + 14, ly + 9),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.3, (230, 230, 230), 1, cv2.LINE_AA)
        ly += 14

    return canvas
