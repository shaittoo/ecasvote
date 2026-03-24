"""
eCASVote paper ballot OMR — OpenCV pipeline aligned with PrintableBallotSheet
(6 fiducials, 3-column contest grid, horizontal ovals).

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

    last_raw: str | None = None
    for v in variants:
        data, _pts, _straight = det.detectAndDecode(v)
        if not data or not data.strip():
            continue
        raw = data.strip()
        last_raw = raw
        parsed, _ = _parse_ballot_qr_json(raw)
        if parsed is not None:
            return parsed, raw

    return None, last_raw


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
    Use 4 corner fiducial zones (black squares) to rectify the sheet.
    Returns 3x3 perspective matrix or None.
    """
    h, w = gray.shape[:2]
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, inv = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    m = int(min(w, h) * 0.16)
    # Order: TL, TR, BR, BL → matches destination quad
    zones = [
        (0, 0, m, m),
        (w - m, 0, w, m),
        (w - m, h - m, w, h),
        (0, h - m, m, h),
    ]
    pts = []
    for (xa, ya, xb, yb) in zones:
        c = _zone_best_centroid(inv, xa, ya, xb, yb)
        if c is None:
            return None
        pts.append(c)
    src = np.array(pts, dtype=np.float32)
    dw, dh = 900, int(900 * 297 / 210)
    dst = np.array(
        [[0, 0], [dw - 1, 0], [dw - 1, dh - 1], [0, dh - 1]], dtype=np.float32
    )
    return cv2.getPerspectiveTransform(src, dst)


def warp_if_possible(bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    H = find_corner_homography(gray)
    if H is None:
        return bgr
    h, w = bgr.shape[:2]
    dw, dh = 900, int(900 * 297 / 210)
    return cv2.warpPerspective(bgr, H, (dw, dh))


def _mean_fill_score(roi_bgr: np.ndarray) -> float:
    if roi_bgr.size == 0:
        return 0.0
    g = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    # Darker = more filled (ink)
    return float(np.mean(255 - g)) / 255.0


def read_bubbles_from_template(warped_bgr: np.ndarray, template: dict[str, Any]) -> dict[str, Any]:
    """
    Map template contests (row-major 3-column print layout) to bubble fill scores.
    Returns raw_scores, selectionsByPosition (list of optionIds per position; multi-mark when maxMarks>1).
    """
    contests: list[dict[str, Any]] = template.get("contests") or []
    if not contests:
        return {
            "raw_scores": {},
            "selectionsByPosition": {},
            "error": "no_contests_in_template",
        }

    H, W = warped_bgr.shape[:2]
    top_skip = int(H * 0.26)
    body = warped_bgr[top_skip:, :]
    bh, bw = body.shape[:2]
    if bh < 80 or bw < 80:
        return {"raw_scores": {}, "selectionsByPosition": {}, "error": "body_too_small"}

    n = len(contests)
    raw_scores: dict[str, dict[str, float]] = {}
    selections_by_position: dict[str, list[str]] = {}

    for idx, contest in enumerate(contests):
        pid = str(contest.get("positionId") or "")
        max_marks = int(contest.get("maxMarks") or 1)
        options = contest.get("options") or []
        if not pid or not options:
            continue

        col = idx % 3
        row_in_col = sum(1 for j in range(idx) if j % 3 == col)
        col_contest_count = sum(1 for j in range(n) if j % 3 == col)
        x0 = col * bw // 3
        x1 = (col + 1) * bw // 3
        ch = bh / max(col_contest_count, 1)
        y0 = int(row_in_col * ch)
        y1 = int((row_in_col + 1) * ch)
        block = body[y0:y1, x0:x1]
        if block.size == 0:
            continue

        # Ovals sit on the left ~38% of each contest column (see PrintableBallotSheet)
        left_w = max(int(block.shape[1] * 0.38), 24)
        left = block[:, :left_w]
        num_opts = len(options)
        scores: dict[str, float] = {}
        lh = left.shape[0]
        for oi, opt in enumerate(options):
            oid = str(opt.get("optionId") or "")
            if not oid:
                continue
            yb0 = int(oi * lh / num_opts)
            yb1 = int((oi + 1) * lh / num_opts)
            row = left[yb0:yb1, :]
            rw = row.shape[1]
            # Sample center of oval column
            c0, c1 = int(rw * 0.08), int(rw * 0.72)
            roi = row[:, c0:c1]
            scores[oid] = _mean_fill_score(roi)

        raw_scores[pid] = scores

        if not scores:
            selections_by_position[pid] = []
            continue

        sorted_opts = sorted(scores.items(), key=lambda x: -x[1])
        threshold = 0.22
        picks: list[str] = []

        if max_marks > 1:
            # Multi-seat / multiple shading: take up to max_marks darkest marks
            topk = sorted_opts[:max_marks]
            relaxed = threshold * 0.72
            picks = [oid for oid, sc in topk if sc >= relaxed]
            if not picks and sorted_opts[0][1] >= threshold * 0.45:
                picks = [sorted_opts[0][0]]
            if len(picks) > max_marks:
                picks = [oid for oid, _ in sorted_opts[:max_marks]]
        else:
            strong = [oid for oid, sc in sorted_opts if sc >= threshold]
            if len(strong) == 0:
                picks = []
            elif len(strong) == 1:
                picks = [strong[0]]
            else:
                picks = []
                raw_scores[pid]["_overvote"] = True

        selections_by_position[pid] = picks

    return {
        "raw_scores": raw_scores,
        "selectionsByPosition": selections_by_position,
        "error": None,
    }


def selections_multi_to_flat(by_pos: dict[str, list[str]]) -> dict[str, str]:
    """Comma-separate multiple marks for legacy / DB-friendly maps."""
    out: dict[str, str] = {}
    for k, ids in by_pos.items():
        if not ids:
            continue
        out[k] = ids[0] if len(ids) == 1 else ",".join(str(x) for x in ids)
    return out


def scan_ballot_image(image_b64: str, template: dict[str, Any]) -> dict[str, Any]:
    img = decode_image_b64(image_b64)
    qr_obj, qr_raw = decode_qr_ballot(img)

    warped = warp_if_possible(img)
    if qr_obj is None:
        qr_obj2, qr_raw2 = decode_qr_ballot(warped)
        if qr_obj2 is not None:
            qr_obj, qr_raw = qr_obj2, qr_raw2
        elif qr_raw is None and qr_raw2:
            qr_raw = qr_raw2
    bubble = read_bubbles_from_template(warped, template)
    by_pos: dict[str, list[str]] = dict(bubble.get("selectionsByPosition") or {})

    return {
        "qr": qr_obj,
        "qrRaw": qr_raw,
        "bubbleRead": bubble,
        "selectionsByPosition": by_pos,
        "rawBubbleScores": bubble.get("raw_scores") or {},
        "selectionsFlat": selections_multi_to_flat(by_pos),
        "warpApplied": warped.shape != img.shape,
    }
