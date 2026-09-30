/**
 * One-off cleanup: removes the "Probe Person" draft testimonial left behind
 * by earlier end-to-end API probing. Safe to re-run — exits quietly when
 * nothing matches.
 *
 * Usage: npx tsx scripts/cleanup-probe-testimonial.mts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const probe = await prisma.testimonial.findMany({ where: { studentName: "Probe Person" } });
for (const t of probe) {
  await prisma.testimonial.delete({ where: { id: t.id } });
  console.log("deleted probe testimonial:", t.id);
}
if (probe.length === 0) console.log("no probe testimonials found");

console.log("remaining testimonials:", await prisma.testimonial.count());
await prisma.$disconnect();
