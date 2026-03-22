import type { PrintableBallotPosition, PaperBallotQrPayload } from "./printableBallotTypes";
import { BALLOT_TEMPLATE_VERSION } from "./ballotTemplate";

/** Sample election + ballot token for thesis / local demo */
export const MOCK_PRINTABLE_BALLOT_META = {
  electionId: "election-2026",
  ballotToken: "TKN-E2026DEMO",
  templateVersion: BALLOT_TEMPLATE_VERSION,
  electionName: "CAS Student Council Election 2026",
} as const;

/** Example QR object (same shape as encoded in the QR on the sheet) */
export const mockBallotQrPayload = (): PaperBallotQrPayload => ({
  electionId: MOCK_PRINTABLE_BALLOT_META.electionId,
  ballotToken: MOCK_PRINTABLE_BALLOT_META.ballotToken,
  templateVersion: MOCK_PRINTABLE_BALLOT_META.templateVersion,
});

/** Mock positions + candidates — swap for API data later */
export const MOCK_PRINTABLE_BALLOT_POSITIONS: PrintableBallotPosition[] = [
  {
    positionId: "chairperson",
    positionName: "Chairperson",
    maxVotes: 1,
    candidates: [
      { candidateId: "cand-chair-1", name: "Alice Cruz" },
      { candidateId: "cand-chair-2", name: "Brian Lee" },
    ],
  },
  {
    positionId: "vice-chairperson",
    positionName: "Vice Chairperson",
    maxVotes: 1,
    candidates: [
      { candidateId: "cand-vice-1", name: "Maria Santos" },
      { candidateId: "cand-vice-2", name: "Carlo Reyes" },
    ],
  },
];
