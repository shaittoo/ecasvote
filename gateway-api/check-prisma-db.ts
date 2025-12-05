// check-prisma-db.ts
import { prisma } from './src/prismaClient';

async function main() {
  console.log('📊 Checking database with Prisma...\n');

  // 1. Count total voters
  const voterCount = await prisma.voter.count();
  console.log(`Total voters: ${voterCount}\n`);

  // 2. Get all voters (or last 10)
  console.log('📋 All voters (last 10):');
  const voters = await prisma.voter.findMany({
    orderBy: { votedAt: 'desc' },
    take: 10,
  });

  if (voters.length === 0) {
    console.log('  (no voters yet)');
  } else {
    voters.forEach((v, i) => {
      console.log(`\n${i + 1}. Voter ID: ${v.id}`);
      console.log(`   Email: ${v.upMail}`);
      console.log(`   Student ID: ${v.studentId}`);
      console.log(`   Election ID: ${v.electionId}`);
      console.log(`   Has Voted: ${v.hasVoted ? '✅ Yes' : '❌ No'}`);
      console.log(`   Voted At: ${v.votedAt?.toISOString() || 'N/A'}`);
    });
  }

  // 3. Count voters who have voted
  const votedCount = await prisma.voter.count({
    where: { hasVoted: true },
  });
  console.log(`\n✅ Voters who have voted: ${votedCount}`);

  // 4. Get specific voter (if test-sqlite-check exists)
  const testVoter = await prisma.voter.findUnique({
    where: { id: 'test-sqlite-check' },
  });
  if (testVoter) {
    console.log('\n🔍 Test voter found:');
    console.log(JSON.stringify(testVoter, null, 2));
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

