// prisma/seed.ts
import 'dotenv/config';
import { prisma } from "../src/lib/prisma";
import { hash } from "bcryptjs";


async function main() {
  const passwordHash = await hash("123456", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@teste.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@teste.com",
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });

  const vendedor = await prisma.user.upsert({
    where: { email: "vendedor@teste.com" },
    update: {},
    create: {
      name: "Vendedor Teste",
      email: "vendedor@teste.com",
      passwordHash,
      role: "VENDEDOR",
      active: true,
    },
  });

  const entregador = await prisma.user.upsert({
    where: { email: "entregador@teste.com" },
    update: {},
    create: {
      name: "Entregador Teste",
      email: "entregador@teste.com",
      passwordHash,
      role: "ENTREGADOR",
      active: true,
    },
  });

  // O vendedor precisa de um SellerProfile pra conseguir vender de verdade
  await prisma.sellerProfile.upsert({
    where: { sellerId: vendedor.id },
    update: {},
    create: {
      sellerId: vendedor.id,
      defaultMarginPercent: 20,
      minMarginPercent: 10,
      maxMarginPercent: 25,
      allowOrderMarginChange: true,
      active: true,
    },
  });

  console.log("Seed concluído:");
  console.log(`- ADMIN:       ${admin.email} / 123456`);
  console.log(`- VENDEDOR:    ${vendedor.email} / 123456`);
  console.log(`- ENTREGADOR:  ${entregador.email} / 123456`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });