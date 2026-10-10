// src/app/clientes/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmado",
  SEPARATING: "Separando",
  READY_FOR_DELIVERY: "Pronto p/ entrega",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ENTREGADOR") redirect("/entregas");

  const { id } = await params;
  const isAdmin = session.user.role === "ADMIN";

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { location: true },
  });

  if (!customer) notFound();

  const orders = await prisma.order.findMany({
    where: {
      customerId: id,
      ...(isAdmin ? {} : { sellerId: session.user.id }),
    },
    include: { payments: { where: { status: "PAID" }, orderBy: { paidAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <Link
          href={`/clientes/${customer.id}/editar`}
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Editar
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
        <p>Documento: {customer.document ?? "—"}</p>
        <p>Telefone: {customer.phone ?? "—"}</p>
        <p>Email: {customer.email ?? "—"}</p>
        <p>
          Localidade: {customer.location.city} - {customer.location.state}
        </p>
        <p className="sm:col-span-2">Endereço: {customer.address ?? "—"}</p>
        {customer.notes && (
          <p className="sm:col-span-2">Observações: {customer.notes}</p>
        )}
      </div>

      <h2 className="mt-8 text-lg font-medium">Histórico de pedidos</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Pedido</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Pago</th>
              <th className="px-4 py-3 font-medium">Saldo</th>
              <th className="px-4 py-3 font-medium">Pagamentos</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Nenhum pedido ainda.
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <tr key={order.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <Link className="text-blue-700 hover:underline" href={`/pedidos/${order.id}`}>
                    #{order.id.slice(-6).toUpperCase()}
                  </Link>
                </td>
                <td className="px-4 py-3">{statusLabels[order.status]}</td>
                <td className="px-4 py-3">
                  {order.total.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </td>
                <td className="px-4 py-3">
                  {order.payments.reduce((sum, payment) => sum + payment.amount, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td className="px-4 py-3 font-medium">
                  {Math.max(0, order.total - order.payments.reduce((sum, payment) => sum + payment.amount, 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {order.payments.length === 0 ? "Nenhum" : order.payments.map((payment) => `${payment.method === "DINHEIRO" ? "Dinheiro" : payment.method} ${payment.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join(", ")}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {order.createdAt.toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
