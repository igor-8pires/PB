import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statusLabels: Record<string, string> = {
  ASSIGNED: "Atribuída",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

const statusColors: Record<string, string> = {
  ASSIGNED: "bg-gray-100 text-gray-700",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function EntregasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VENDEDOR") redirect("/pedidos");
  if (session.user.role === "ENTREGADOR") redirect("/entregas/minhas");

  const deliveries = await prisma.delivery.findMany({
    include: {
      order: { include: { customer: true } },
      courier: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Todas as entregas</h1>
        <Link
          href="/entregas/relatorio"
          className="inline-flex min-h-10 items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Relatório de rota
        </Link>
      </header>
      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Entregador</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Atribuída em</th>
              <th className="px-4 py-3 font-medium">Entregue em</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhuma entrega encontrada.
                </td>
              </tr>
            )}
            {deliveries.map((delivery) => (
              <tr key={delivery.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">{delivery.order.customer.name}</td>
                <td className="px-4 py-3">{delivery.courier?.name ?? "— sem entregador —"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[delivery.status]}`}
                  >
                    {statusLabels[delivery.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {delivery.assignedAt ? delivery.assignedAt.toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {delivery.deliveredAt ? delivery.deliveredAt.toLocaleDateString("pt-BR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
