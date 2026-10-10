import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Package, Phone, Truck, UserRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentPanel } from "@/modules/payments/payment-panel";

const statusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmado",
  SEPARATING: "Separando",
  READY_FOR_DELIVERY: "Pronto para entrega",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const deliveryLabels: Record<string, string> = {
  ASSIGNED: "Atribuída",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

export default async function PedidoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      seller: true,
      payments: {
        where: { status: "PAID" },
        include: { recordedBy: { select: { name: true } } },
        orderBy: { paidAt: "desc" },
      },
      items: { include: { product: true } },
      deliveries: { include: { courier: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!order) notFound();

  const delivery = order.deliveries[0];
  const canView = session.user.role === "ADMIN" || order.sellerId === session.user.id || delivery?.courierId === session.user.id;
  if (!canView) redirect("/entregas");

  const standardTotal = order.items.reduce((sum, item) => {
    const quantity = item.enteredQuantity ?? item.quantity;
    const standardUnitPrice =
      item.basePrice *
      (1 + order.defaultMarginPercent / 100) *
      (1 - item.quantityDiscountPercent / 100);
    return sum + standardUnitPrice * quantity;
  }, 0);
  const sellerDiscount = Math.max(standardTotal - order.total, 0);
  const canCollectForDelivery =
    session.user.role === "ENTREGADOR" &&
    delivery?.courierId === session.user.id &&
    ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(delivery.status);
  const canRecordPayment =
    session.user.role === "ADMIN" ||
    order.sellerId === session.user.id ||
    canCollectForDelivery;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:py-10">
      <Link href={session.user.role === "ENTREGADOR" ? "/entregas" : "/pedidos"} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-sky-700">
        <ArrowLeft className="size-4" aria-hidden="true" /> Voltar
      </Link>
      <header className="mt-7 flex flex-col gap-4 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-700">Pedido #{order.id.slice(-6).toUpperCase()}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{order.customer.name}</h1><div className="mt-2 space-y-1 text-sm text-slate-500"><p>Criado em {order.createdAt.toLocaleString("pt-BR")}</p><p>Atualizado em {order.updatedAt.toLocaleString("pt-BR")}</p></div></div>
        <span className="w-fit rounded-full bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700">{statusLabels[order.status]}</span>
      </header>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Package className="size-5 text-sky-600" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950">Itens do pedido</h2>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {order.items.map((item) => {
              const enteredQuantity = item.enteredQuantity ?? item.quantity;
              const enteredUnit = item.enteredUnit ?? item.product.unit;
              const enteredUnitPrice = item.total / enteredQuantity;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-baseline gap-3 py-4 first:pt-0"
                >
                  <span className="font-semibold tabular-nums text-slate-950">
                    {enteredQuantity}
                  </span>
                  <span className="text-sm text-slate-500">{enteredUnit}</span>
                  <div>
                    <p className="font-medium text-slate-900">{item.product.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {enteredUnitPrice.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })} por unidade
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums text-slate-950">
                    {item.total.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-5 space-y-2 border-t border-slate-200 pt-5 text-sm">
            {sellerDiscount > 0.005 && (
              <>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>
                    {standardTotal.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Desconto</span>
                  <span>
                    - {sellerDiscount.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between pt-2 text-base font-semibold">
              <span>Total</span>
              <span>
                {order.total.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>
            </div>
          </div>
        </section>
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold text-slate-950">Entrega</h2><div className="mt-5 space-y-4 text-sm text-slate-600"><p className="flex gap-3"><MapPin className="size-4 shrink-0 text-sky-600" aria-hidden="true" /><span>{order.customer.address ?? "Endereço não informado"}</span></p>{order.customer.phone && <p className="flex gap-3"><Phone className="size-4 shrink-0 text-slate-400" aria-hidden="true" /><span>{order.customer.phone}</span></p>}<p className="flex gap-3"><Truck className="size-4 shrink-0 text-slate-400" aria-hidden="true" /><span>{delivery ? deliveryLabels[delivery.status] : "Sem entrega vinculada"}</span></p>{delivery?.courier && <p className="flex gap-3"><UserRound className="size-4 shrink-0 text-slate-400" aria-hidden="true" /><span>{delivery.courier.name}</span></p>}{order.notes && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><p className="font-semibold">Observações para o entregador</p><p className="mt-1 whitespace-pre-wrap">{order.notes}</p></div>}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Responsável pela venda</p><p className="mt-2 font-semibold text-slate-900">{order.seller.name}</p></section>
        </div>
      </div>
      {canRecordPayment && (
        <div className="mt-5">
          <PaymentPanel
            orderId={order.id}
            customerName={order.customer.name}
            total={order.total}
            payments={order.payments}
            isAdmin={session.user.role === "ADMIN"}
            canRecord={canRecordPayment}
            showHistory
            termsApprovedAt={order.paymentTermsApprovedAt}
            dueAt={order.paymentDueAt}
          />
        </div>
      )}
    </main>
  );
}