import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const email = "admin@cys.local";
const password = "ChangeMeNow!";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  if (!process.env.NEXTAUTH_SECRET) console.warn("NEXTAUTH_SECRET missing (login may fail)");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const hashed = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hashed, role: "ADMIN", name: "CYS Admin" },
    create: { email, passwordHash: hashed, role: "ADMIN", name: "CYS Admin" },
  });

  const found = await prisma.user.findUnique({ where: { email } });
  console.log("ADMIN SEEDED:", { email: found?.email, role: found?.role });

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
