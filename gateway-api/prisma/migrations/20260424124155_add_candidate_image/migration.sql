-- CreateTable
CREATE TABLE "ElectionVoter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "electionId" TEXT NOT NULL,
    "voterId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ElectionVoter_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ElectionVoter_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperBallotIssuance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ballotToken" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "voterId" INTEGER NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    "templateVersion" TEXT NOT NULL DEFAULT 'ballot-template-v1',
    CONSTRAINT "PaperBallotIssuance_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperAnonymousVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "ballotToken" TEXT NOT NULL,
    "ciphertextB64" TEXT NOT NULL,
    "selectionsJson" JSONB NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "castAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ElectionVoter_electionId_idx" ON "ElectionVoter"("electionId");

-- CreateIndex
CREATE INDEX "ElectionVoter_voterId_idx" ON "ElectionVoter"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionVoter_electionId_voterId_key" ON "ElectionVoter"("electionId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperBallotIssuance_ballotToken_key" ON "PaperBallotIssuance"("ballotToken");

-- CreateIndex
CREATE INDEX "PaperBallotIssuance_electionId_voterId_idx" ON "PaperBallotIssuance"("electionId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperAnonymousVote_ballotToken_key" ON "PaperAnonymousVote"("ballotToken");
