// prisma/seedUsers.ts
import { prisma } from '../src/prismaClient';
import * as bcrypt from 'bcrypt';

async function main() {
  console.log('🌱 Seeding users...');

  // Hash passwords
  const saltRounds = 10;
  const adminPassword = await bcrypt.hash('admin123', saltRounds);
  const validatorPassword = await bcrypt.hash('validator123', saltRounds);
  const adviserPassword = await bcrypt.hash('adviser123', saltRounds);

  // Create Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@up.edu.ph' },
    update: {
      password: adminPassword,
      fullName: 'SEB Administrator',
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      email: 'admin@up.edu.ph',
      password: adminPassword,
      fullName: 'SEB Administrator',
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log('✅ Created admin user:', admin.email);

  // Create Validator users
  const validator1 = await prisma.user.upsert({
    where: { email: 'validator@up.edu.ph' },
    update: {
      password: validatorPassword,
      fullName: 'Validator User',
      role: 'VALIDATOR',
      isActive: true,
    },
    create: {
      email: 'validator@up.edu.ph',
      password: validatorPassword,
      fullName: 'Validator User',
      role: 'VALIDATOR',
      isActive: true,
    },
  });
  console.log('✅ Created validator user:', validator1.email);

  const validator2 = await prisma.user.upsert({
    where: { email: 'adviser@up.edu.ph' },
    update: {
      password: adviserPassword,
      fullName: 'Adviser User',
      role: 'VALIDATOR',
      isActive: true,
    },
    create: {
      email: 'adviser@up.edu.ph',
      password: adviserPassword,
      fullName: 'Adviser User',
      role: 'VALIDATOR',
      isActive: true,
    },
  });
  console.log('✅ Created adviser user:', validator2.email);

  // Note: Students don't need User accounts - they log in via the Voter table
  // using studentNumber/upEmail. User accounts are only for ADMIN and VALIDATOR roles.

  console.log('✅ User seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

