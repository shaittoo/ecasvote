/**
 * Preview ballot token for admin prints when no `TKN-…` has been issued yet.
 * Not valid for casting — replace with API-issued token from Token Status / roster flow.
 */
export function buildPreviewBallotToken(electionId: string): string {
  const slug = electionId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug}-BAL-PREVIEW`.toUpperCase();
}

/** @deprecated Use {@link buildPreviewBallotToken} */
export const buildPreviewPaperBallotId = buildPreviewBallotToken;
