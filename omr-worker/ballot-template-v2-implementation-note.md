# Ballot Template V2 Scanner Update

## What Changed From Old Scanner

- Added a template-v2 aware scanning path in `app/ballot_omr.py` (kept legacy path for older templates).
- Introduced explicit template geometry/config in `app/ballot_template_v2.py` for canonical A4 warp, edge timing counts, QR zone, and bubble masks.
- Refactored the v2 flow into staged functions:
  - `preprocess_image()`
  - `detect_corner_fiducials()`
  - `compute_homography()`
  - `_rotate_to_template_orientation()`
  - `detect_timing_marks()`
  - `decode_qr_v2()`
  - `map_template_regions()`
  - `score_bubbles_v2()`
  - `_validate_contest_marks_v2()`

## Orientation Determination

- The scanner detects corner fiducials in corner search zones.
- Each corner patch is normalized and pattern-scored using the unique internal white-cutout structure.
- After initial homography, orientation is resolved by testing 0/90/180/270 rotations and selecting the rotation with the best match to expected corner fiducial identities.

## Timing Mark Usage

- Edge timing marks are detected in top/bottom/left/right edge bands on the warped canonical image.
- Mark count and spacing residuals are compared against expected v2 timing patterns.
- A timing confidence score is produced and attached to scan output for alignment validation and safe-fail decisions.

## Bubble Fill Scoring

- Bubble scoring is now circle-aware and locally normalized:
  - inner/core mask
  - ring/reference mask
  - optional outer local background mask
- The fill score is based on relative darkness of core vs ring/background, improving tolerance to pencil, light marks, noise, and uneven lighting.
- Contest picks are validated against `maxMarks`, with configurable abstain conflict policy in `_validate_contest_marks_v2()`.

## Failure Cases Handled

- Structured failure reasons now include:
  - `insufficient_fiducials`
  - `orientation_ambiguous`
  - `timing_alignment_low_confidence`
  - `qr_unreadable`
  - `bubble_confidence_too_low`
- Output includes stage confidence scores and debug metadata for diagnostics.

