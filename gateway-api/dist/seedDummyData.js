"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/seedDummyData.ts
const prismaClient_1 = require("./prismaClient");
async function main() {
    console.log('Seeding dummy voters...');
    const electionId = 'election-2025';
    const voters = [
        { id: 'voter1', upMail: 'voter1@up.edu.ph', studentId: '2025-00001' },
        { id: 'voter2', upMail: 'voter2@up.edu.ph', studentId: '2025-00002' },
        { id: 'voter3', upMail: 'voter3@up.edu.ph', studentId: '2025-00003' },
        { id: 'voter4', upMail: 'voter4@up.edu.ph', studentId: '2025-00004' },
        { id: 'voter5', upMail: 'voter5@up.edu.ph', studentId: '2025-00005' },
    ];
    for (const v of voters) {
        await prismaClient_1.prisma.voter.upsert({
            where: { id: v.id },
            update: {
                upMail: v.upMail,
                studentId: v.studentId,
                electionId: electionId,
            },
            create: {
                id: v.id,
                electionId: electionId,
                upMail: v.upMail,
                studentId: v.studentId,
                hasVoted: false,
            },
        });
        console.log(`✅ Seeded voter: ${v.id} (${v.upMail})`);
    }
    console.log(`\n✅ Done! Seeded ${voters.length} voters.`);
}
main()
    .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
})
    .finally(async () => {
    await prismaClient_1.prisma.$disconnect();
});
