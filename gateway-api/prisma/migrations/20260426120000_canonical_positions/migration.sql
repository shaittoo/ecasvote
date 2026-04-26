-- Canonical Position model: remove per-election duplication.
-- Candidate.positionId becomes a FK to global slugs (usc-councilor, etc.).

-- 1) Strip election-scoped position IDs on candidates (e.g. uuid__usc-councilor -> usc-councilor)
UPDATE "Candidate"
SET "positionId" = substr("positionId", instr("positionId", '__') + 2)
WHERE instr("positionId", '__') > 0;

-- 2) Replace Position with a single canonical row set
CREATE TABLE "Position_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "maxVotes" INTEGER NOT NULL,
    "order" INTEGER NOT NULL
);

INSERT INTO "Position_new" ("id", "name", "maxVotes", "order") VALUES
('usc-councilor', 'USC Councilor', 3, 1),
('cas-rep-usc', 'CAS Rep. to the USC', 1, 2),
('cas-chairperson', 'CAS Chairperson', 1, 3),
('cas-vice-chairperson', 'CAS Vice Chairperson', 1, 4),
('cas-councilor', 'CAS Councilor', 5, 5),
('clovers-governor', 'Clovers Governor', 1, 6),
('elektrons-governor', 'Elektrons Governor', 1, 7),
('redbolts-governor', 'Redbolts Governor', 1, 8),
('skimmers-governor', 'Skimmers Governor', 1, 9);

-- 3) Point orphan candidate rows at a valid canonical id (data repair)
UPDATE "Candidate"
SET "positionId" = 'usc-councilor'
WHERE "positionId" NOT IN (
  'usc-councilor',
  'cas-rep-usc',
  'cas-chairperson',
  'cas-vice-chairperson',
  'cas-councilor',
  'clovers-governor',
  'elektrons-governor',
  'redbolts-governor',
  'skimmers-governor'
);

DROP TABLE "Position";
ALTER TABLE "Position_new" RENAME TO "Position";
