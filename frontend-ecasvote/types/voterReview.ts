export interface VoterReviewPayload {
  ballotToken: string;
  tokenValidationOk: boolean;
  electionName: string;
  selectionsByPosition: Record<string, string[]>;
  positionLabels: Record<string, string>;
  candidateLabels: Record<string, string>;
  maxVotesByPosition: Record<string, number>;
}
