-- CreateTable
CREATE TABLE "BallotLayout" (
    "ballotId" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "layoutJson" TEXT NOT NULL,
    "layoutHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "BallotLayout_electionId_idx" ON "BallotLayout"("electionId");

-- CreateIndex
CREATE INDEX "BallotLayout_templateId_idx" ON "BallotLayout"("templateId");
