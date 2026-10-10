// src/app/clientes/novo/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerForm } from "../customer-form";

export default async function NovoClientePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ENTREGADOR") redirect("/entregas");

  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: { city: "asc" },
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Novo cliente</h1>
      <CustomerForm
        locations={locations.map((l) => ({
          id: l.id,
          label: `${l.city} - ${l.state}`,
        }))}
      />
    </main>
  );
}
