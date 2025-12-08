/*
  Warnings:

  - The primary key for the `Voter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `electionId` on the `Voter` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `Voter` table. All the data in the column will be lost.
  - You are about to drop the column `upMail` on the `Voter` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `Voter` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - Added the required column `college` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `department` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `program` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `studentNumber` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `upEmail` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Voter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `yearLevel` to the `Voter` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Voter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentNumber" TEXT NOT NULL,
    "upEmail" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "college" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "yearLevel" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "hasVoted" BOOLEAN NOT NULL DEFAULT false,
    "votedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Voter" ("hasVoted", "id", "votedAt") SELECT "hasVoted", "id", "votedAt" FROM "Voter";
DROP TABLE "Voter";
ALTER TABLE "new_Voter" RENAME TO "Voter";
CREATE UNIQUE INDEX "Voter_studentNumber_key" ON "Voter"("studentNumber");
CREATE UNIQUE INDEX "Voter_upEmail_key" ON "Voter"("upEmail");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
