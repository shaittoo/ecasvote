# Ballot Template V2 Developer Note

## What Changed

- Upgraded default template version to `ballot-template-v2` in `lib/ballot/ballotTemplate.ts` while keeping `ballot-template-v1` constant available for legacy references.
- Reworked `components/ballot/PrintableBallotSheet.tsx` into a full-page registration layout with a strong outer scan frame that uses near-edge placement (with printer-safe margins).
- Added unique corner fiducials (`TL`, `TR`, `BL`, `BR`) that keep the same outer dimensions but use different internal white cutouts so orientation is unambiguous from corners alone.
- Replaced small edge dots with larger square timing marks on all four sides to improve contour detection and perspective/warp stabilization.
- Moved the QR block into a reserved metadata zone inside the machine-readable frame (bottom-right), with isolation and clean border separation from contests.
- Standardized bubble row geometry (bubble size, row height, spacing, grid columns) for repeatable OpenCV cropping and thresholding.
- Updated `lib/ballot/scannerTemplateSpec.ts` metadata to describe the new fiducial style, unique corner patterns, QR quiet zone guidance, and uniform bubble row grid.

## Why This Is More OpenCV-Friendly

- The registration system is now visually dominant (thicker, darker, larger geometric markers) and independent from text/contest visuals.
- Unique corner markers reduce orientation ambiguity and simplify page pose initialization.
- Repeated square timing marks provide stable edge features for line fitting and drift correction under skew, blur, and uneven lighting.
- QR is now inside a dedicated machine-readable area, making crop boundaries predictable while preserving contest region integrity.
- Contest rows use strict, repeatable geometry so one row template can be applied consistently across candidates and abstain rows.

## Assumptions (Printing and Scanning)

- Paper size: A4 (`210mm x 297mm`).
- Safe printer margin target: about `6-7mm` from page edges for registration marks.
- Recommended scan/camera effective resolution: at least `300 DPI` equivalent for batch scans (or comparable phone camera sharpness).
- Critical geometry intentionally uses thick black borders/shapes; no color-dependent detection assumptions are required.

## Generated Sample Output

- PDF preview: `frontend-ecasvote/docs/ballot-template-v2-sample.pdf`
- PNG preview: `frontend-ecasvote/docs/ballot-template-v2-sample.png`

