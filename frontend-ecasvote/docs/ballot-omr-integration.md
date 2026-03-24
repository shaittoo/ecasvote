# Paper ballot OMR integration (Open MCR vs ExamGrader)

eCASVote prints **custom** sheets via `PrintableBallotSheet` (fiducials, horizontal ovals, QR for `electionId` + `ballotToken` + `templateVersion`). Ballot scanning should stay aligned with that layout.

## References

| Tool | Notes |
|------|--------|
| **[Open MCR](https://github.com/iansan5653/open-mcr)** | GPL-3.0, Python + OpenCV. Uses **fixed** 75Q/150Q PDFs — not the eCASVote sheet. Algorithm reference; in-repo scanning uses **`omr-worker/`**. |
| **[ExamGrader](https://sites.google.com/site/examgrader/downloads)** | Third-party desktop grader; not wired to the API. Optional offline workflow. |

**For eCASVote’s layout:** run **`omr-worker/`** + gateway `OMR_WORKER_URL`, with exported **`ecasvote-scanner-template/1`** from `lib/ballot/scannerTemplateSpec.ts`.

## Multiple shading (multi-mark contests)

- On paper, each contest has **`maxVotes`** (see template `maxMarks`): the voter may fill **up to that many** ovals (e.g. councilors-at-large).
- OMR should **not** assume single-choice only:
  - Detect fill level per bubble (or binary filled / not).
  - For each contest, accept the **top `maxMarks` options by darkness** (or use Open MCR’s uncertainty / rejection if extended).
  - If **more than `maxMarks`** are strongly filled → flag **overvote / ambiguous** for manual review.

The exported template sets `omrHints.interpretation` to `top-k-by-fill-darkness` when any contest has `maxMarks > 1`.

## Integration shape (implemented)

1. **Browser (Ballot Scanning)** — builds `scannerTemplate` + base64 image → `POST /scanner/scan-image`.
2. **Gateway** — forwards to **`omr-worker`** `POST /scan` when `OMR_WORKER_URL` is set; merges **token validation** (Prisma `paperBallotIssuance`).
3. **`omr-worker/`** — OpenCV QR decode, optional **fiducial warp**, heuristic bubble read from template + `omrHints`.
4. If the worker is **offline**, the UI falls back to **browser QR + `POST /scanner/validate`** (no bubbles).

**Recording votes:** `POST /scanner/confirm-vote` with `selections` from OMR (`selectionsFlat` / normalized object) is a logical next step (not auto-fired from scan UI yet).

## Template file

Export from the admin UI: `scanner-template-{electionId}.json`.  
Schema: `schemaVersion: "ecasvote-scanner-template/1"`.

## Raw scan export (admin)

After **Scan ballots**, use **Download raw JSON** (per batch) or **Export all batches**.

- Single batch: `schemaVersion: "ecasvote-scan-export/1"` — `ballots[]` with `selectionsByPosition` (**string arrays** per `positionId` for multi-mark), `rawBubbleScores`, `selectionsFlat`, `omrWorkerPayload`, `tokenValidation`.
- All batches: `schemaVersion: "ecasvote-scan-export-batch-list/1"` — `batches[]` of the above.

Defined in `lib/ballot/scanExport.ts`.
