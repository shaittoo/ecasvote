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

    # Printed contests have visible borders/text ink density; blank gaps do not.
    return dark_ratio >= 0.012 and top_band_dark >= 0.035


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
    # Skip the header (institution lines + instructions box) at the top of the scan frame
    # and the small system/template line at the bottom.
    # The QR code lives *outside* the fiducial frame (in the HTML footer), so it is already
    # cropped away by the perspective warp — only a thin padding band remains at the bottom.
    #
    # PrintableBallotSheet layout (print CSS):
    #   top:    pt-5(20px) + header content + mb-2(8px) ≈ 13 % of warped frame height
    #   bottom: system line + pb-3(12px)                 ≈  5 % of warped frame height
    top_skip = int(H * 0.13)
    bottom_skip = int(H * 0.05)
    y_body1 = min(H - bottom_skip, H)
    if y_body1 <= top_skip + 80:
        top_skip = int(H * 0.10)
        bottom_skip = int(H * 0.03)
        y_body1 = min(H - bottom_skip, H)
    body = warped_bgr[top_skip:y_body1, :]
    bh, bw = body.shape[:2]
    if bh < 80 or bw < 80:
        return {"raw_scores": {}, "selectionsByPosition": {}, "error": "body_too_small"}

    # The scan frame has timing strips + padding that eat into the left and right edges.
    # PrintableBallotSheet (print CSS) per side:
    #   pl-6 (24 px) + timing w-1.5 (6 px) + gap-1 (4 px) + border (1 px) + px-1.5 (6 px) = 41 px
    # At a frame width of ≈762 px (A4 printable at 96 DPI), 41/762 ≈ 5.4 %.
    # The warp preserves this fraction, so use the same ratio against bw (≈900 px).
    side_margin = int(bw * 0.054)
    content_x0 = side_margin
    content_w = bw - 2 * side_margin

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
        # Divide only the content-area width (between timing strips) into 3 columns.
        col_w = content_w / 3.0

        scores: dict[str, float] = {}
        for oi, opt in enumerate(options):
            oid = str(opt.get("optionId") or "")
            if not oid:
                continue
            r, c = oi // 3, oi % 3
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

    # ── Recompute the same geometry as read_bubbles_from_template ──────────
    top_skip = int(H * 0.13)
    bottom_skip = int(H * 0.05)
    y_body1 = min(H - bottom_skip, H)
    if y_body1 <= top_skip + 80:
        top_skip = int(H * 0.10)
        bottom_skip = int(H * 0.03)
        y_body1 = H - bottom_skip

    bh = y_body1 - top_skip
    side_margin = int(W * 0.054)
    content_x0 = side_margin
    content_w = W - 2 * side_margin
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
        num_opts = len(options)
        num_rows = max(1, (num_opts + 2) // 3)

        # Contest strip rectangle
        cv2.rectangle(canvas, (content_x0, y0), (content_x0 + content_w, y1), color, 2)
        cv2.putText(canvas, pid[:28], (content_x0 + 4, y0 + 13),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, color, 1, cv2.LINE_AA)

        # Header-bar skip line (dark yellow)
        strip_h = y1_rel - y0_rel
        hdr = max(6, int(strip_h * 0.12))
        cv2.line(canvas, (content_x0, y0 + hdr), (content_x0 + content_w, y0 + hdr),
                 (0, 180, 180), 1)

        grid_h = strip_h - hdr
        if grid_h < 20:
            continue
        row_h = grid_h / num_rows

        contest_scores: dict[str, Any] = raw_scores.get(pid) or {}
        picked: list[str] = selections.get(pid) or []

        for oi, opt in enumerate(options):
            oid = str(opt.get("optionId") or "")
            row_i, col_i = oi // 3, oi % 3

            ys0 = y0 + hdr + int(row_i * row_h)
            ys1 = y0 + hdr + int((row_i + 1) * row_h)
            xs0 = content_x0 + int(col_i * col_w)
            xs1 = content_x0 + int((col_i + 1) * col_w)

            # Cell outline (thin grey)
            cv2.rectangle(canvas, (xs0, ys0), (xs1, ys1), (100, 100, 100), 1)

            # Bubble position
            cw_cell = xs1 - xs0
            ch_cell = ys1 - ys0
            bx = xs0 + int(cw_cell * 0.20)
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
