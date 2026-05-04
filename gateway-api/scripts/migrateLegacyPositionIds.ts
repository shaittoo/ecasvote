import 'dotenv/config';

/**
 * One-time: align legacy Position/Candidate rows with scoped ids `{electionId}__{slug}`.
 * Safe to re-run: skips rows that already match the prefix pattern.
 *
 * Does NOT touch Vote or PaperAnonymousVote (selection keys stay short chain slugs).
 *
 * Usage (from gateway-api): npx ts-node scripts/migrateLegacyPositionIds.ts
 */
import { prisma } from '../src/prismaClient';

async function main() {
  const candRows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "Candidate"
    WHERE "positionId" NOT LIKE ("electionId" || '__' || '%')
  `;
  const posRows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "Position"
    WHERE "id" NOT LIKE ("electionId" || '__' || '%')
  `;

  const nCand = Number(candRows[0]?.c ?? 0);
  const nPos = Number(posRows[0]?.c ?? 0);

  console.log(`Candidates still on legacy positionId format: ${nCand}`);
  console.log(`Positions still on legacy id format: ${nPos}`);

  const candResult = await prisma.$executeRaw`
    UPDATE "Candidate"
    SET "positionId" = "electionId" || '__' || "positionId"
    WHERE "positionId" NOT LIKE ("electionId" || '__' || '%')
  `;
  const posResult = await prisma.$executeRaw`
    UPDATE "Position"
    SET "id" = "electionId" || '__' || "id"
    WHERE "id" NOT LIKE ("electionId" || '__' || '%')
  `;

  console.log(`Updated Candidate rows: ${candResult}`);
  console.log(`Updated Position rows: ${posResult}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
