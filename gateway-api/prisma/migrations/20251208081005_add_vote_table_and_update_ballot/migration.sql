/*
  Warnings:

  - You are about to drop the column `castAt` on the `Ballot` table. All the data in the column will be lost.
  - You are about to drop the column `selections` on the `Ballot` table. All the data in the column will be lost.
  - You are about to drop the column `voterId` on the `Ballot` table. All the data in the column will be lost.
  - Added the required column `createdBy` to the `Ballot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Ballot` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "selections" JSONB NOT NULL,
    "txId" TEXT,
    "castAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ballot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Ballot" ("electionId", "id") SELECT "electionId", "id" FROM "Ballot";
DROP TABLE "Ballot";
ALTER TABLE "new_Ballot" RENAME TO "Ballot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
