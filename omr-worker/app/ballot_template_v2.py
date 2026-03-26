"""
Template geometry and scanner constants for ballot-template-v2.

All coordinates are normalized (0..1) in canonical A4 warp space.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TimingSpec:
    top_count: int = 12
    bottom_count: int = 12
    left_count: int = 18
    right_count: int = 18
    band_thickness: float = 0.07
    min_square_px: int = 8
    max_square_px: int = 34


@dataclass(frozen=True)
class BubbleSpec:
    # Candidate row structure in each cell: [num][bubble][name].
    center_x_in_cell: float = 0.22
    center_y_in_cell: float = 0.50
    radius_in_cell: float = 0.18
    min_radius_px: int = 5
    max_radius_px: int = 14
    # Ring-aware masks for local normalization.
    core_radius_ratio: float = 0.52
    ring_inner_ratio: float = 0.82
    ring_outer_ratio: float = 1.45
    bg_inner_ratio: float = 1.70
    bg_outer_ratio: float = 2.20


@dataclass(frozen=True)
class LayoutSpec:
    # Canonical output size after warp.
    canonical_w: int = 900
    canonical_h: int = 1272
    # Keep-out around timing marks / corner fiducials.
    content_x0: float = 0.105
    content_x1: float = 0.895
    content_y0: float = 0.118
    content_y1: float = 0.975
    # Header and metadata zones inside content.
    header_y1: float = 0.245
    qr_zone_x0: float = 0.72
    qr_zone_x1: float = 0.97
    qr_zone_y0: float = 0.80
    qr_zone_y1: float = 0.985
    # Contest region below header and above metadata footer.
    contests_y0: float = 0.255
    contests_y1: float = 0.84
    contest_header_frac: float = 0.20
    contest_inner_pad_x: float = 0.01
    contest_inner_pad_y: float = 0.01


TIMING_SPEC = TimingSpec()
BUBBLE_SPEC = BubbleSpec()
LAYOUT_SPEC = LayoutSpec()


def expected_edge_mark_positions(width: int, height: int) -> dict[str, list[tuple[float, float]]]:
    """
    Return expected timing mark centers in canonical coordinates.
    """
    t = TIMING_SPEC
    left_x = width * 0.055
    right_x = width * 0.945
    top_y = height * 0.07
    bottom_y = height * 0.93

    def _linspace(a: float, b: float, n: int) -> list[float]:
        if n <= 1:
            return [(a + b) * 0.5]
        step = (b - a) / (n - 1)
        return [a + i * step for i in range(n)]

    xs = _linspace(width * 0.09, width * 0.91, t.top_count)
    ys = _linspace(height * 0.09, height * 0.91, t.left_count)

    return {
        "top": [(x, top_y) for x in xs],
        "bottom": [(x, bottom_y) for x in xs],
        "left": [(left_x, y) for y in ys],
        "right": [(right_x, y) for y in ys],
    }

