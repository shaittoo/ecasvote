# Ballot Template V4 Developer Note

## What Changed From V3

- Added `ballot-template-v4` and set it as the default print template version.
- Kept v3 available; `PrintableBallotSheet` now branches for v2/v3/v4 by `templateVersion`.
- Replaced v3's larger inner contest anchor box approach with **compact alignment rails**.
- Each contest row now includes a required **left rail marker** and optional mirrored **right rail marker**.
- Preserved single-column bubble placement per contest (same bubble X for all rows).
- Maintained strict A4 fitting and clean bubble region (no line crossing through bubbles).

## How Alignment Rails Work

- The left rail is a vertical sequence of per-row square markers.
- Each marker is horizontally aligned with the corresponding bubble center.
- OpenCV can lock each row to its local marker pair/baseline before scoring bubbles.
- Optional right rail improves robustness when perspective skew is non-uniform.

## Why This Improves OpenCV Detection

- Local row markers reduce vertical drift that remains after global page homography.
- Single-column bubbles reduce horizontal ambiguity and ROI search complexity.
- No horizontal line intersects bubbles, avoiding false darkness in bubble masks.
- Compact structure preserves space while improving local alignment reliability.

