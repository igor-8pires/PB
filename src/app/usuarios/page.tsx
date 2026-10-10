import { redirect } from "next/navigation";
import type { OrderStatus } from "@/generated/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const revenueStatuses: OrderStatus[] = [
  "CONFIRMED",
  "SEPARATING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default async function UsuariosPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [sellers, revenueBySeller] = await Promise.all([
    prisma.user.findMany({
      where: { role: "VENDEDOR", active: true },
      select: {
        id: true,
        name: true,
        email: true,
        sellerProfile: {
          select: {
            defaultMarginPercent: true,
            minMarginPercent: true,
            maxMarginPercent: true,
            allowOrderMarginChange: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.order.groupBy({
      by: ["sellerId"],
      where: { status: { in: revenueStatuses } },
      _count: { _all: true },
      _sum: { total: true },
      _avg: { appliedMarginPercent: true },
    }),
  ]);

  const revenueMap = new Map(
    revenueBySeller.map((seller) => [seller.sellerId, seller]),
  );

  return (
    <main className="p-8">
      <header>
        <p className="text-sm font-medium text-gray-500">Gestão comercial</p>
        <h1 className="mt-1 text-2xl font-semibold">Vendedores</h1>
        <p className="mt-2 text-sm text-gray-500">
          Arrecadação e margens por vendedor em um só lugar.
        </p>
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Vendedor</th>
              <th className="px-4 py-3 font-medium">Pedidos</th>
              <th className="px-4 py-3 font-medium">Arrecadação</th>
              <th className="px-4 py-3 font-medium">Margem média aplicada</th>
              <th className="px-4 py-3 font-medium">Margem padrão</th>
              <th className="px-4 py-3 font-medium">Faixa permitida</th>
              <th className="px-4 py-3 font-medium">Alteração por pedido</th>
            </tr>
          </thead>
          <tbody>
            {sellers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Nenhum vendedor ativo encontrado.
                </td>
              </tr>
            )}
            {sellers.map((seller) => {
              const revenue = revenueMap.get(seller.id);
              const profile = seller.sellerProfile;
              const orderCount =
                revenue && typeof revenue._count !== "boolean"
                  ? revenue._count?._all ?? 0
                  : 0;
              const totalRevenue = revenue?._sum?.total ?? 0;
              const averageMargin = revenue?._avg?.appliedMarginPercent;

              return (
                <tr key={seller.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{seller.name}</p>
                    <p className="text-xs text-gray-500">{seller.email}</p>
                  </td>
                  <td className="px-4 py-3">{orderCount}</td>
                  <td className="px-4 py-3 font-medium">
                    {formatBRL(totalRevenue)}
                  </td>
                  <td className="px-4 py-3">
                    {averageMargin == null
                      ? "-"
                      : `${averageMargin.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-3">
                    {profile ? `${profile.defaultMarginPercent}%` : "Não configurada"}
                  </td>
                  <td className="px-4 py-3">
                    {profile
                      ? `${profile.minMarginPercent}% a ${profile.maxMarginPercent}%`
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {profile?.allowOrderMarginChange ? "Permitida" : "Fixa"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
