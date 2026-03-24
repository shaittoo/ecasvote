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
    # Bubble center tends to be around x ~20% of cell width, centered vertically.
    cx = int(cw * 0.20)
    cy = int(ch * 0.50)
    r = max(4, int(min(cw, ch) * 0.18))

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
    # Skip header (institution + instructions) and footer (identifier + QR).
    top_skip = int(H * 0.22)
    bottom_skip = int(H * 0.13)
    y_body1 = min(H - bottom_skip, H)
    if y_body1 <= top_skip + 80:
        top_skip = int(H * 0.18)
        bottom_skip = int(H * 0.10)
        y_body1 = min(H - bottom_skip, H)
    body = warped_bgr[top_skip:y_body1, :]
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

        # Vertical strip for this contest (full width of body).
        ch = bh / max(n, 1)
        y0 = int(idx * ch)
        y1 = int((idx + 1) * ch)
        strip = body[y0:y1, :]
        if strip.size == 0:
            continue

        num_opts = len(options)
        num_rows = max(1, (num_opts + 2) // 3)
        sh, sw = strip.shape[:2]
        # Omit colored title + "Choose — N" band at top of each contest block.
        header_frac = 0.12
        hdr = max(6, int(sh * header_frac))
        grid = strip[hdr:, :] if sh > hdr + 16 else strip
        sh, sw = grid.shape[:2]
        if sh < 20 or sw < 30:
            continue
        row_h = sh / num_rows
        col_w = sw / 3.0

        scores: dict[str, float] = {}
        for oi, opt in enumerate(options):
            oid = str(opt.get("optionId") or "")
            if not oid:
                continue
            r, c = oi // 3, oi % 3
            ys0 = int(r * row_h)
            ys1 = int((r + 1) * row_h)
            xs0 = int(c * col_w)
            xs1 = int((c + 1) * col_w)
            cell = grid[ys0:ys1, xs0:xs1]
            scores[oid] = _score_bubble_in_grid_cell(cell)

        raw_scores[pid] = scores

        if not scores:
            selections_by_position[pid] = []
            continue

        # Absolute + relative thresholds reduce false positives in uneven lighting.
        sorted_opts = sorted(scores.items(), key=lambda x: -x[1])
        norm_scores = _normalize_scores(scores)
        abs_threshold = 0.075
        rel_threshold = 0.55
        second_gap = 0.03
        picks: list[str] = []

        vals = np.array(list(scores.values()), dtype=np.float32)
        top_abs = float(sorted_opts[0][1]) if sorted_opts else 0.0
        median_abs = float(np.median(vals)) if vals.size else 0.0
        # Blank/noise guard: skip selection when the top bubble is weak and not
        # meaningfully separated from the contest baseline.
        low_signal_contest = top_abs < abs_threshold or (top_abs - median_abs) < 0.02

        if max_marks > 1:
            # Multi-seat / multiple shading: take up to max_marks darkest marks
            vals = sorted(scores.values())
            baseline = float(np.median(vals))
            dynamic_min = max(abs_threshold, baseline + 0.035)
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
        else:
            top_oid, top_abs = sorted_opts[0]
            top_rel = norm_scores[top_oid]
            second_abs = sorted_opts[1][1] if len(sorted_opts) > 1 else 0.0
            if top_abs < abs_threshold or top_rel < rel_threshold:
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
