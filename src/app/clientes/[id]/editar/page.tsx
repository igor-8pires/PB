// src/app/clientes/[id]/editar/page.tsx
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerForm } from "../../customer-form";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ENTREGADOR") redirect("/entregas");

  const { id } = await params;

  const [customer, locations] = await Promise.all([
    prisma.customer.findUnique({ where: { id } }),
    prisma.location.findMany({ where: { active: true }, orderBy: { city: "asc" } }),
  ]);

  if (!customer) notFound();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Editar cliente</h1>
      <CustomerForm
        locations={locations.map((l) => ({
          id: l.id,
          label: `${l.city} - ${l.state}`,
        }))}
        customer={{
          id: customer.id,
          name: customer.name,
          document: customer.document,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          locationId: customer.locationId,
          notes: customer.notes,
        }}
      />
    </main>
  );
}
