// src/app/pedidos/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OfflineSnapshotWriter } from "@/components/offline-session";



const statusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmado",
  SEPARATING: "Separando",
  READY_FOR_DELIVERY: "Pronto p/ entrega",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  SEPARATING: "bg-amber-100 text-amber-700",
  READY_FOR_DELIVERY: "bg-amber-100 text-amber-700",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function PedidosPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // ENTREGADOR não lida com pedidos diretamente, só com entregas
  if (session.user.role === "ENTREGADOR") {
    redirect("/entregas");
  }

  const isAdmin = session.user.role === "ADMIN";

  const orders = await prisma.order.findMany({
    where: isAdmin ? {} : { sellerId: session.user.id },
    include: {
      customer: true,
      seller: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="p-8">
      <OfflineSnapshotWriter
        userId={session.user.id}
        role={session.user.role}
        route="/pedidos"
        data={orders.map((order) => ({
          id: order.id,
          customerName: order.customer.name,
          sellerName: order.seller.name,
          status: order.status,
          total: order.total,
          createdAt: order.createdAt.toISOString(),
        }))}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <Link
          href="/pedidos/novo"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Novo pedido
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Pedido</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Vendedor</th>}
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                  Nenhum pedido encontrado.
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/pedidos/${order.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    #{order.id.slice(-6).toUpperCase()}
                  </Link>
                </td>
                <td className="px-4 py-3">{order.customer.name}</td>
                {isAdmin && <td className="px-4 py-3">{order.seller.name}</td>}
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[order.status]}`}
                  >
                    {statusLabels[order.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {order.total.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
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
