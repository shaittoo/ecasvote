import 'dotenv/config';

/**
 * One-time: add every CAS enrolled eligible voter to every election's roster.
 * After running, use admin "Remove from this election" to drop voters from specific elections
 * (e.g. remove Juan from a test election).
 *
 * Usage: npx ts-node --esm scripts/backfillElectionRosters.ts
 *    or:  node --import tsx scripts/backfillElectionRosters.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const elections = await prisma.election.findMany({ select: { id: true, name: true } });
  const voters = await prisma.voter.findMany({
    where: { college: 'CAS', status: 'ENROLLED', isEligible: true },
    select: { id: true },
  });
  let totalAdded = 0;
  for (const e of elections) {
    for (const v of voters) {
      try {
        await prisma.electionVoter.create({
          data: { electionId: e.id, voterId: v.id },
        });
        totalAdded += 1;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== 'P2002') throw err;
      }
    }
    console.log(`Election ${e.id} (${e.name}): synced ${voters.length} roster slots (new rows where missing)`);
  }
  console.log(`Done. New rows added (approx): ${totalAdded}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
