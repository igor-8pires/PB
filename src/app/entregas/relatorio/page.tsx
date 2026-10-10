import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportPrintButton } from "../report-print-button";

const methodLabels: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  CARTAO: "Cartão",
  OUTRO: "Outros",
};

function getTodayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getSaoPauloDayRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 3));
  return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value: Date | null) {
  if (!value) return "Não informado";
  return value.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function DeliveryRouteReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; courierId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const today = getTodayInSaoPaulo();
  const date = params.date && isValidDate(params.date) ? params.date : today;
  const dateRange = getSaoPauloDayRange(date);

  const couriers = await prisma.user.findMany({
    where: { role: "ENTREGADOR" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const selectedCourierId = couriers.some((courier) => courier.id === params.courierId)
    ? params.courierId
    : "";

  const deliveries = await prisma.delivery.findMany({
    where: {
      status: "DELIVERED",
      deliveredAt: dateRange,
      ...(selectedCourierId ? { courierId: selectedCourierId } : {}),
    },
    include: {
      courier: { select: { id: true, name: true } },
      order: {
        include: {
          customer: { select: { name: true, address: true } },
          payments: {
            where: { status: "PAID", paidAt: dateRange },
            include: { recordedBy: { select: { name: true } } },
            orderBy: { paidAt: "asc" },
          },
        },
      },
    },
    orderBy: [{ startedAt: "asc" }, { deliveredAt: "asc" }],
  });

  const totalsByMethod = deliveries
    .flatMap((delivery) => delivery.order.payments)
    .reduce<Record<string, number>>((totals, payment) => {
      totals[payment.method] = (totals[payment.method] ?? 0) + payment.amount;
      return totals;
    }, {});
  const totalPaid = Object.values(totalsByMethod).reduce((sum, amount) => sum + amount, 0);
  const paymentCount = deliveries.reduce(
    (count, delivery) => count + delivery.order.payments.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 print:max-w-none print:px-0 print:py-0">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 print:hidden">
        <div>
          <Link href="/entregas" className="text-sm font-medium text-slate-500 hover:underline">
            Voltar para entregas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Relatório de rota</h1>
        </div>
        <ReportPrintButton />
      </header>

      <form
        action="/entregas/relatorio"
        method="get"
        className="grid gap-3 border-b border-slate-200 pb-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end print:hidden"
      >
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Dia da rota
          <input
            type="date"
            name="date"
            required
            defaultValue={date}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Entregador
          <select
            name="courierId"
            defaultValue={selectedCourierId}
            className="rounded-md border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Todos os entregadores</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-10 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Gerar relatório
        </button>
      </form>

      <section className="space-y-1">
        <p className="text-xs font-semibold uppercase text-slate-500">Rota concluída em</p>
        <h2 className="text-xl font-semibold text-slate-950">
          {new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
        </h2>
        <p className="text-sm text-slate-600">
          {selectedCourierId
            ? `Entregador: ${couriers.find((courier) => courier.id === selectedCourierId)?.name}`
            : "Todos os entregadores"}
        </p>
      </section>

      <section aria-label="Resumo de pagamentos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="border-l-4 border-slate-800 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">Total recebido</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{formatBRL(totalPaid)}</p>
        </div>
        {Object.entries(methodLabels).map(([method, label]) => (
          <div key={method} className="border-l-4 border-emerald-700 bg-white px-4 py-3">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
              {formatBRL(totalsByMethod[method] ?? 0)}
            </p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-3 text-sm text-slate-600">
        <span>{deliveries.length} entregas concluídas</span>
        <span>{paymentCount} recebimentos no dia</span>
      </div>

      {deliveries.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Nenhuma entrega concluída encontrada para os filtros selecionados.
        </p>
      ) : (
        <section className="divide-y divide-slate-200">
          {deliveries.map((delivery, index) => (
            <article key={delivery.id} className="py-5 first:pt-0">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Parada {index + 1}</p>
                  <h3 className="mt-1 font-semibold text-slate-950">
                    {delivery.order.customer.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {delivery.order.customer.address ?? "Endereço não informado"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Entregador: {delivery.courier?.name ?? "Não identificado"} · Pedido #{delivery.orderId.slice(-6).toUpperCase()}
                  </p>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p>Início: {formatDateTime(delivery.startedAt)}</p>
                  <p>Concluída: {formatDateTime(delivery.deliveredAt)}</p>
                </div>
              </header>

              {delivery.order.payments.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Nenhum pagamento recebido neste dia.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[580px] text-sm">
                    <thead className="border-y border-slate-200 text-left text-slate-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Forma</th>
                        <th className="px-3 py-2 text-right font-medium">Valor</th>
                        <th className="px-3 py-2 font-medium">Recebido em</th>
                        <th className="py-2 pl-3 font-medium">Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delivery.order.payments.map((payment) => (
                        <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 text-slate-800">
                            {methodLabels[payment.method] ?? payment.method}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-950">
                            {formatBRL(payment.amount)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{formatDateTime(payment.paidAt)}</td>
                          <td className="py-2 pl-3 text-slate-600">
                            {payment.recordedBy?.name ?? "Usuário não identificado"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}