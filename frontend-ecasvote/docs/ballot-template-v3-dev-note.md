# Ballot Template V3 Developer Note

## What Changed From V2

- Introduced `ballot-template-v3` and made it the default template version.
- Kept v2 intact; `PrintableBallotSheet` now renders either v2 or v3 layout by `templateVersion`.
- V3 contests now use a **local anchor box** per contest with four corner anchors.
- V3 switched to a **single vertical bubble column per contest** (one bubble X for all rows).
- Added **row-level markers** (left and right) aligned with each bubble center.
- Increased bubble size and outline thickness for more robust shading detection.

## Why This Improves OpenCV Accuracy

- Corner fiducials + timing marks still provide global page alignment.
- Contest anchor boxes provide local correction when residual warp remains after global homography.
- Row markers support row-by-row baseline checks and reduce vertical drift.
- Single-column bubbles remove horizontal ambiguity and simplify ROI extraction.
- Bubble areas remain clean (no decorative fills, no crossing guide lines through bubbles).

## Rendering Outputs

- V3 sample PDF: `frontend-ecasvote/docs/ballot-template-v3-sample.pdf`
- V3 sample PNG: `frontend-ecasvote/docs/ballot-template-v3-sample.png`

