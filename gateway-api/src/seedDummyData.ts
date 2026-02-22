// src/seedDummyData.ts
import { prisma } from './prismaClient';

async function main() {
  console.log('Seeding positions, candidates, and voters...');

  const electionId = 'election-2025';

  // Define all positions
  const positions = [
    { id: 'usc-councilor', name: 'USC Councilor', maxVotes: 3, order: 1 },
    { id: 'cas-rep-usc', name: 'CAS Rep. to the USC', maxVotes: 1, order: 2 },
    { id: 'cas-chairperson', name: 'CAS Chairperson', maxVotes: 1, order: 3 },
    { id: 'cas-vice-chairperson', name: 'CAS Vice Chairperson', maxVotes: 1, order: 4 },
    { id: 'cas-councilor', name: 'CAS Councilor', maxVotes: 5, order: 5 },
    { id: 'clovers-governor', name: 'Clovers Governor', maxVotes: 1, order: 6 },
    { id: 'elektrons-governor', name: 'Elektrons Governor', maxVotes: 1, order: 7 },
    { id: 'redbolts-governor', name: 'Redbolts Governor', maxVotes: 1, order: 8 },
    { id: 'skimmers-governor', name: 'Skimmers Governor', maxVotes: 1, order: 9 },
  ];

  // Helper function to get candidates for each position
  function getCandidatesForPosition(positionId: string): Array<{ name: string; party: string; program: string; yearLevel: string }> {
    const candidatesMap: Record<string, Array<{ name: string; party: string; program: string; yearLevel: string }>> = {
      'usc-councilor': [
        { name: 'Maria Santos', party: 'PMB', program: 'BS Computer Science', yearLevel: '3rd Year' },
        { name: 'Juan Dela Cruz', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '2nd Year' },
        { name: 'Ana Garcia', party: 'Independent', program: 'BS Biology', yearLevel: '4th Year' },
        { name: 'Carlos Reyes', party: 'PMB', program: 'BS Chemistry', yearLevel: '3rd Year' },
      ],
      'cas-rep-usc': [
        { name: 'Patricia Lopez', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '4th Year' },
        { name: 'Roberto Tan', party: 'PMB', program: 'BS Mathematics', yearLevel: '3rd Year' },
      ],
      'cas-chairperson': [
        { name: 'Sofia Martinez', party: 'PMB', program: 'BS Biology', yearLevel: '4th Year' },
        { name: 'Miguel Fernandez', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '4th Year' },
        { name: 'Isabella Cruz', party: 'Independent', program: 'BS Chemistry', yearLevel: '3rd Year' },
      ],
      'cas-vice-chairperson': [
        { name: 'Diego Ramos', party: 'PMB', program: 'BS Mathematics', yearLevel: '3rd Year' },
        { name: 'Elena Torres', party: 'SAMASA', program: 'BS Biology', yearLevel: '3rd Year' },
      ],
      'cas-councilor': [
        { name: 'Gabriel Villanueva', party: 'PMB', program: 'BS Computer Science', yearLevel: '2nd Year' },
        { name: 'Lucia Mendoza', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '3rd Year' },
        { name: 'Fernando Castro', party: 'Independent', program: 'BS Biology', yearLevel: '2nd Year' },
        { name: 'Valentina Ortega', party: 'PMB', program: 'BS Chemistry', yearLevel: '4th Year' },
        { name: 'Ricardo Navarro', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '3rd Year' },
        { name: 'Camila Silva', party: 'Independent', program: 'BS Mathematics', yearLevel: '2nd Year' },
      ],
      'clovers-governor': [
        { name: 'Alejandro Morales', party: 'PMB', program: 'BS Computer Science', yearLevel: '3rd Year' },
        { name: 'Daniela Herrera', party: 'SAMASA', program: 'BS Biology', yearLevel: '2nd Year' },
      ],
      'elektrons-governor': [
        { name: 'Nicolas Jimenez', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '3rd Year' },
        { name: 'Adriana Vega', party: 'PMB', program: 'BS Computer Science', yearLevel: '4th Year' },
        { name: 'Sebastian Ruiz', party: 'Independent', program: 'BS Chemistry', yearLevel: '2nd Year' },
      ],
      'redbolts-governor': [
        { name: 'Victoria Paredes', party: 'PMB', program: 'BS Biology', yearLevel: '3rd Year' },
        { name: 'Andres Moreno', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '2nd Year' },
      ],
      'skimmers-governor': [
        { name: 'Olivia Cordero', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '4th Year' },
        { name: 'Mateo Salazar', party: 'PMB', program: 'BS Chemistry', yearLevel: '3rd Year' },
        { name: 'Emma Gutierrez', party: 'Independent', program: 'BS Biology', yearLevel: '2nd Year' },
      ],
    };

    return candidatesMap[positionId] || [
      { name: `Candidate 1 - ${positionId}`, party: 'TBD', program: 'TBD', yearLevel: 'TBD' },
    ];
  }

  // Seed positions
  console.log('\n📋 Seeding positions...');
  let totalCandidates = 0;
  for (const pos of positions) {
    await prisma.position.upsert({
      where: { id: pos.id },
      update: {
        name: pos.name,
        maxVotes: pos.maxVotes,
        order: pos.order,
        electionId: electionId,
      },
      create: {
        id: pos.id,
        electionId: electionId,
        name: pos.name,
        maxVotes: pos.maxVotes,
        order: pos.order,
      },
    });
    console.log(`✅ Seeded position: ${pos.name} (maxVotes: ${pos.maxVotes})`);

    // Create candidates for each position
    const candidatesData = getCandidatesForPosition(pos.id);
    for (let i = 0; i < candidatesData.length; i++) {
      const candidateId = `cand-${pos.id}-${i + 1}`;
      await prisma.candidate.upsert({
        where: { id: candidateId },
        update: {
          name: candidatesData[i].name,
          party: candidatesData[i].party,
          program: candidatesData[i].program,
          yearLevel: candidatesData[i].yearLevel,
          electionId: electionId,
          positionId: pos.id,
        },
        create: {
          id: candidateId,
          electionId: electionId,
          positionId: pos.id,
          name: candidatesData[i].name,
          party: candidatesData[i].party,
          program: candidatesData[i].program,
          yearLevel: candidatesData[i].yearLevel,
        },
      });
      console.log(`   ✅ Seeded candidate: ${candidatesData[i].name} (${candidatesData[i].party})`);
      totalCandidates++;
    }
  }

  // Note: Voters are seeded separately using npm run seed:voters
  // This seed file only handles positions and candidates

  console.log(`\n✅ Done! Seeded ${positions.length} positions and ${totalCandidates} candidates.`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


