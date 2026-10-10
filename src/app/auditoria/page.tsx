import { redirect } from "next/navigation";
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

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
  SEPARATING: "bg-amber-50 text-amber-700 border-amber-200",
  READY_FOR_DELIVERY: "bg-indigo-50 text-indigo-700 border-indigo-200",
  OUT_FOR_DELIVERY: "bg-purple-50 text-purple-700 border-purple-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const toNumber = (value: number | string | null | undefined | { toNumber?: () => number }): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export default async function AuditDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // 1. Consulta Todos os Pedidos (Ativos e Cancelados) para Auditoria Completa
  const allOrders = await prisma.order.findMany({
    include: {
      customer: {
        include: {
          location: { select: { id: true, name: true, city: true, state: true } },
        },
      },
      seller: {
        select: { id: true, name: true, email: true },
      },
      payments: {
        select: { amount: true, status: true, method: true },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, costPrice: true, sku: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Filtra Pedidos Válidos (Não Cancelados) vs Cancelados
  const activeOrders = allOrders.filter((o) => o.status !== "CANCELLED");
  const cancelledOrders = allOrders.filter((o) => o.status === "CANCELLED");

  // 2. Consulta Posicionamento Físico e Valor Imobilizado do Estoque
  const stockMovements = await prisma.stockMovement.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
  });

  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, name: true, sku: true, costPrice: true },
  });

  const lowStockThreshold = 15;
  const stockMap = new Map<string, number>();
  stockMovements.forEach((s) => {
    stockMap.set(s.productId, s._sum.quantity || 0);
  });

  let totalImmobilizedStockValue = 0;
  const lowStockProducts: Array<{ id: string; name: string; sku: string | number; costPrice: number; stock: number }> = [];

  products.forEach((p) => {
    const stockQty = stockMap.get(p.id) || 0;
    totalImmobilizedStockValue += stockQty * toNumber(p.costPrice);
    if (stockQty <= lowStockThreshold) {
      lowStockProducts.push({ ...p, stock: stockQty, costPrice: toNumber(p.costPrice) });
    }
  });

  // -------------------------------------------------------------
  // BLOCO 1: Indicadores de Receita e Vendas (Top Line)
  // -------------------------------------------------------------
  const totalRevenue = activeOrders.reduce((sum, order) => sum + toNumber(order.total), 0);
  const totalOrderCount = activeOrders.length;
  const averageTicket = totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0;

  // -------------------------------------------------------------
  // BLOCO 2: Indicadores de Margem e Lucratividade
  // -------------------------------------------------------------
  const totalCostOfGoodsSold = activeOrders.reduce((sum, order) => {
    return (
      sum +
      order.items.reduce(
        (itemSum, item) => itemSum + toNumber(item.quantity) * toNumber(item.product.costPrice),
        0,
      )
    );
  }, 0);

  const grossProfit = totalRevenue - totalCostOfGoodsSold;
  const globalProfitMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Média da Margem Comercial Aplicada pelos Vendedores
  const validMarginOrders = activeOrders.filter((o) => o.appliedMarginPercent !== null);
  const avgSellerMarginApplied =
    validMarginOrders.length > 0
      ? validMarginOrders.reduce((sum, o) => sum + toNumber(o.appliedMarginPercent), 0) /
        validMarginOrders.length
      : 0;

  // -------------------------------------------------------------
  // BLOCO 3: Fluxo de Caixa, Arrecadação e Meios de Pagamento
  // -------------------------------------------------------------
  let totalPaidAmount = 0;
  const paymentMethodTotals: Record<string, number> = {
    PIX: 0,
    CREDIT_CARD: 0,
    DEBIT_CARD: 0,
    CASH: 0,
    BOLETO: 0,
    OUTROS: 0,
  };

  const isConfirmedPayment = (status?: string | null) => {
    const normalizedStatus = status?.trim().toUpperCase();
    return normalizedStatus === "CONFIRMED" || normalizedStatus === "PAID" || normalizedStatus === "SETTLED";
  };

  const normalizePaymentMethod = (method?: string | null) => {
    const normalizedMethod = (method || "OUTROS").trim().toUpperCase().replace(/[-\s]+/g, "_");

    if (normalizedMethod === "CREDITCARD" || normalizedMethod === "CREDIT_CARD") {
      return "CREDIT_CARD";
    }

    if (normalizedMethod === "DEBITCARD" || normalizedMethod === "DEBIT_CARD") {
      return "DEBIT_CARD";
    }

    return normalizedMethod in paymentMethodTotals ? normalizedMethod : "OUTROS";
  };

  activeOrders.forEach((order) => {
    order.payments.forEach((p) => {
      if (isConfirmedPayment(p.status)) {
        totalPaidAmount += toNumber(p.amount);
        const method = normalizePaymentMethod(p.method);
        paymentMethodTotals[method] += toNumber(p.amount);
      }
    });
  });

  const pendingReceivables = Math.max(0, totalRevenue - totalPaidAmount);

  // -------------------------------------------------------------
  // BLOCO 4: Auditoria Comercial e Desempenho por Vendedor
  // -------------------------------------------------------------
  const sellerStatsMap = new Map<
    string,
    { name: string; totalSales: number; revenue: number; marginSum: number; orderCountWithMargin: number }
  >();

  activeOrders.forEach((order) => {
    const sellerId = order.sellerId;
    const sellerName = order.seller?.name || "Vendedor Não Identificado";
    const current = sellerStatsMap.get(sellerId) || {
      name: sellerName,
      totalSales: 0,
      revenue: 0,
      marginSum: 0,
      orderCountWithMargin: 0,
    };

    current.totalSales += 1;
    current.revenue += toNumber(order.total);
    if (order.appliedMarginPercent !== null) {
      current.marginSum += toNumber(order.appliedMarginPercent);
      current.orderCountWithMargin += 1;
    }

    sellerStatsMap.set(sellerId, current);
  });

  const sellerPerformance = Array.from(sellerStatsMap.values())
    .map((s) => ({
      name: s.name,
      totalSales: s.totalSales,
      revenue: s.revenue,
      avgMargin: s.orderCountWithMargin > 0 ? s.marginSum / s.orderCountWithMargin : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // -------------------------------------------------------------
  // BLOCO 5: Impacto Por Localidade / Região
  // -------------------------------------------------------------
  const locationStatsMap = new Map<string, { locationName: string; revenue: number; count: number }>();

  activeOrders.forEach((order) => {
    const locName = order.customer.location
      ? `${order.customer.location.city} - ${order.customer.location.state}`
      : "Não Mapeada";
    const current = locationStatsMap.get(locName) || { locationName: locName, revenue: 0, count: 0 };
    current.revenue += toNumber(order.total);
    current.count += 1;
    locationStatsMap.set(locName, current);
  });

  const locationPerformance = Array.from(locationStatsMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Perda por Cancelamentos
  const cancelledLossTotal = cancelledOrders.reduce((sum, order) => sum + toNumber(order.total), 0);

  const recentOrders = allOrders.slice(0, 8);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Cabeçalho do Painel */}
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <p className="text-xs font-bold tracking-wider text-blue-600 uppercase">
                Auditoria Comercial & Controladoria
              </p>
            </div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
              Painel Financeiro & Governança de Vendas
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Consolidação de faturamento, margens aplicadas, recebíveis, fluxo por meio de pagamento e controle de estoque.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/pedidos/novo"
              className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
            >
              + Emissão de Venda
            </Link>
            <Link
              href="/estoque"
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Gestão de Estoque
            </Link>
          </div>
        </header>

        {/* BLOCO 1 & 2: Indicadores Financeiros Chave (KPI Cards) */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Faturamento Bruto e Ticket Médio */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Receita Bruta</p>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                {totalOrderCount} vendas
              </span>
            </div>
            <p className="mt-3 text-3xl font-black text-slate-900">{currency.format(totalRevenue)}</p>
            <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Ticket Médio:</span>
              <span className="font-bold text-slate-800">{currency.format(averageTicket)}</span>
            </div>
          </div>

          {/* Card 2: Lucro Bruto e Margem Global */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Lucro Bruto Real</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  globalProfitMarginPercent >= 20
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {globalProfitMarginPercent.toFixed(1)}% Margem
              </span>
            </div>
            <p className="mt-3 text-3xl font-black text-emerald-600">{currency.format(grossProfit)}</p>
            <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Custo dos Produtos (CPV):</span>
              <span className="font-semibold text-slate-700">{currency.format(totalCostOfGoodsSold)}</span>
            </div>
          </div>

          {/* Card 3: Arrecadação e Saldo a Receber */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Fluxo de Recebíveis</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  pendingReceivables > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {pendingReceivables > 0 ? "Pendente" : "Quitado"}
              </span>
            </div>
            <p className="mt-3 text-3xl font-black text-slate-900">{currency.format(totalPaidAmount)}</p>
            <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">A Receber:</span>
              <span className="font-bold text-rose-600">{currency.format(pendingReceivables)}</span>
            </div>
          </div>

          {/* Card 4: Valor do Estoque e Perda por Cancelamento */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Estoque Imobilizado</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                Ativos
              </span>
            </div>
            <p className="mt-3 text-3xl font-black text-slate-900">{currency.format(totalImmobilizedStockValue)}</p>
            <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500">Cancelamentos ({cancelledOrders.length}):</span>
              <span className="font-bold text-slate-600">{currency.format(cancelledLossTotal)}</span>
            </div>
          </div>
        </section>

        {/* BLOCO 3: Distribuição por Meio de Pagamento */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Arrecadação por Forma de Pagamento</h2>
              <p className="text-xs text-slate-500">Valores liquidados e confirmados na conta da empresa</p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              Total Liquidado: {currency.format(totalPaidAmount)}
            </span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-5">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">PIX</p>
              <p className="mt-2 text-xl font-extrabold text-slate-900">{currency.format(paymentMethodTotals.PIX)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Cartão de Crédito</p>
              <p className="mt-2 text-xl font-extrabold text-slate-900">{currency.format(paymentMethodTotals.CREDIT_CARD)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Cartão de Débito</p>
              <p className="mt-2 text-xl font-extrabold text-slate-900">{currency.format(paymentMethodTotals.DEBIT_CARD)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Dinheiro</p>
              <p className="mt-2 text-xl font-extrabold text-slate-900">{currency.format(paymentMethodTotals.CASH)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Boleto / Outros</p>
              <p className="mt-2 text-xl font-extrabold text-slate-900">
                {currency.format(paymentMethodTotals.BOLETO + paymentMethodTotals.OUTROS)}
              </p>
            </div>
          </div>
        </section>

        {/* Alerta de Estoque Baixo / Ruptura */}
        {lowStockProducts.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-amber-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-base font-bold text-amber-950">
                  Alerta de Reposição de Estoque ({lowStockProducts.length} itens abaixo do limite)
                </h2>
              </div>
              <Link href="/estoque" className="text-xs font-bold text-amber-900 hover:underline">
                Acessar Estoque →
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {lowStockProducts.map((p) => (
                <div key={p.id} className="rounded-lg border border-amber-200 bg-white p-3 shadow-xs">
                  <p className="text-xs font-mono text-slate-400">SKU: {p.sku}</p>
                  <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                  <p className="mt-1 text-sm font-bold text-amber-700">
                    Saldo: {p.stock} un <span className="text-xs font-normal text-slate-500">(Mín: {lowStockThreshold})</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* BLOCO 4 & 5: Auditoria por Vendedor e Região */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Ranking & Auditoria de Vendedores */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Auditoria Comercial de Vendedores</h2>
                <p className="text-xs text-slate-500">Volume de vendas e margem média praticada em campo</p>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                Média Geral: {avgSellerMarginApplied.toFixed(1)}%
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Vendedor</th>
                    <th className="py-2.5 px-3 text-center">Pedidos</th>
                    <th className="py-2.5 px-3 text-right">Margem Média</th>
                    <th className="py-2.5 px-3 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sellerPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">
                        Nenhum registro de venda por vendedor.
                      </td>
                    </tr>
                  ) : (
                    sellerPerformance.map((s) => (
                      <tr key={s.name} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-medium text-slate-900">{s.name}</td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-600">{s.totalSales}</td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                              s.avgMargin < 15
                                ? "bg-rose-50 text-rose-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {s.avgMargin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {currency.format(s.revenue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Desempenho Por Localidade */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Desempenho por Região / Localidade</h2>
                <p className="text-xs text-slate-500">Distribuição do faturamento por praça comercial</p>
              </div>
              <Link href="/localidades" className="text-xs font-bold text-blue-600 hover:underline">
                Preços Base →
              </Link>
            </div>
            <div className="mt-4 space-y-4">
              {locationPerformance.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Sem vendas regionais computadas.</p>
              ) : (
                locationPerformance.map((loc) => {
                  const percent = totalRevenue > 0 ? (loc.revenue / totalRevenue) * 100 : 0;
                  return (
                    <div key={loc.locationName} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-800">{loc.locationName}</span>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">{currency.format(loc.revenue)}</span>
                          <span className="ml-2 text-xs text-slate-400">({loc.count} vds)</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* Tabela de Operações Recentes */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Últimos Pedidos Auditados</h2>
              <p className="text-xs text-slate-500">Rastreabilidade em tempo real de cada transação</p>
            </div>
            <Link href="/pedidos" className="text-xs font-bold text-blue-600 hover:underline">
              Ver Todos os Pedidos →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">ID Pedido</th>
                  <th className="px-6 py-3.5">Cliente & Cidade</th>
                  <th className="px-6 py-3.5">Vendedor</th>
                  <th className="px-6 py-3.5">Data / Hora</th>
                  <th className="px-6 py-3.5 text-right">Margem</th>
                  <th className="px-6 py-3.5 text-right">Total</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 font-mono font-bold text-blue-600">
                        #{order.id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{order.customer.name}</p>
                        <p className="text-xs text-slate-500">
                          {order.customer.location
                            ? `${order.customer.location.city} - ${order.customer.location.state}`
                            : "Sem região"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {order.seller?.name || "Vendedor"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500 text-xs">
                        {new Date(order.createdAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-semibold text-slate-700">
                        {order.appliedMarginPercent !== null ? `${order.appliedMarginPercent}%` : "Padrão"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-bold text-slate-900">
                        {currency.format(order.total)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <span
                          className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${
                            statusColors[order.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {statusLabels[order.status] || order.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
