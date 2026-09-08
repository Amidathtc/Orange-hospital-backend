// Run once, manually, to create Dr. Megbuwawon's own admin account —
// after this, every other staff account gets created through
// POST /auth/create-staff, which requires being logged in as an admin already.
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.SEED_ADMIN_PHONE;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const email = process.env.SEED_ADMIN_EMAIL; // optional — recommended, not required
  const fullName = process.env.SEED_ADMIN_NAME ?? 'Admin';

  if (!phone || !password) {
    console.log(
      'Skipping admin seed — set SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD in .env to create one.',
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log(`An account with phone ${phone} already exists — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { fullName, phone, email, passwordHash, role: Role.ADMIN },
  });

  console.log(`Admin account created for ${fullName} (${phone}). You can log in now.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
