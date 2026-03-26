# Printable ballot (eCASVote)

## Files

| File | Purpose |
|------|---------|
| `PrintableBallotSheet.tsx` | Reusable ballot UI with scan-friendly full-page frame: unique corner fiducials, edge timing squares, in-frame QR metadata block, strict contest geometry. `ballot-template-v4` uses compact row-alignment rails + single-column bubbles (no large inner contest box). |
| `PrintBallotActions.tsx` | “Print ballot” button + helper text (hidden when printing). |

## Types & mock data

| Path | Purpose |
|------|---------|
| `lib/ballot/printableBallotTypes.ts` | TypeScript types for props and QR payload. |
| `lib/ballot/buildBallotQrPayload.ts` | Builds `{ electionId, ballotToken, templateVersion }` and JSON string for QR. |
| `lib/ballot/mockPrintableBallotData.ts` | Mock IDs and positions — replace with API. |

## Routes

- **`app/admin/ballot-print/page.tsx`** + **`BallotPrintClient.tsx`** — `/admin/ballot-print` loads **real data** via `fetchElection` + `fetchPositions` (gateway).
- Query: `?electionId=election-2025` (defaults to `election-2025` if omitted).
- **Ballot Token** on the sheet must be the gateway-issued paper token (`TKN-…`). Voter-specific prints load it from paper check-in / paper-tokens; there is no student-number-based preview token on the sheet.
- Generic admin preview (no voter) may still use `buildPreviewBallotToken(electionId)` until a real token is passed via URL.

## Mapping

- `lib/ballot/mapPositionsToPrintable.ts` — maps gateway `Position[]` → `PrintableBallotPosition[]`.
- `lib/ballot/ballotTemplate.ts` — `BALLOT_TEMPLATE_VERSION` for QR (`ballot-template-v4` default; v1/v2/v3 kept as legacy).

## Mock data (tests / Storybook only)

- `lib/ballot/mockPrintableBallotData.ts` — optional; not used by the ballot-print page anymore.

QR encodes only `{ electionId, ballotToken, templateVersion }` — not vote choices.
