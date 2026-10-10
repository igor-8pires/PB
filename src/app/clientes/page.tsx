// src/app/clientes/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ENTREGADOR") redirect("/entregas");

  const { q } = await searchParams;

  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { document: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {},
    include: { location: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Link
          href="/clientes/novo"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Novo cliente
        </Link>
      </div>

      <form className="mt-4">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, documento ou telefone..."
          className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
        />
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Documento</th>
              <th className="px-4 py-3 font-medium">Telefone</th>
              <th className="px-4 py-3 font-medium">Localidade</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/clientes/${customer.id}`} className="hover:underline">
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500">{customer.document ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">{customer.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  {customer.location.city} - {customer.location.state}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/clientes/${customer.id}/editar`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
