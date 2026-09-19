import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });
import { prisma } from './src/lib/prisma.js';

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } });
  console.log('=== USERS IN DB ===');
  console.log(JSON.stringify(users, null, 2));

  const assignments = await prisma.routeAssignment.findMany({
    include: {
      surveyor: { select: { id: true, email: true, name: true } },
      route: { include: { ward: true } }
    }
  });
  console.log('\n=== ROUTE ASSIGNMENTS IN DB ===');
  console.log(JSON.stringify(assignments, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
