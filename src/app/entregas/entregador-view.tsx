import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { assignDeliveryAction, updateDeliveryStatusAction } from "./actions";
import { DeliveryChecklist } from "./delivery-checklist";
import { OfflineSnapshotWriter } from "@/components/offline-session";

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

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatQuantity(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function getOrderBalance(order: { total: number; payments: { amount: number }[] }) {
  const paidAmount = order.payments.reduce((total, payment) => total + payment.amount, 0);
  return Math.max(Math.round((order.total - paidAmount) * 100) / 100, 0);
}

type DeliveryView = "mine" | "available" | "relation" | "history";

export async function EntregadorView({
  entregadorId,
  view,
}: {
  entregadorId: string;
  view: DeliveryView;
}) {
  const deliveries = await prisma.delivery.findMany({
    where:
      view === "mine"
        ? { courierId: entregadorId, status: { in: ["ASSIGNED", "OUT_FOR_DELIVERY"] } }
        : view === "available"
          ? { courierId: null, status: "ASSIGNED" }
          : view === "relation"
            ? { courierId: entregadorId, status: "ASSIGNED" }
            : { courierId: entregadorId, status: { in: ["DELIVERED", "FAILED", "CANCELLED"] } },
    include: {
      occurrences: {
        orderBy: { createdAt: "desc" },
        select: { id: true, description: true, createdAt: true },
      },
      order: {
        include: {
          customer: true,
          items: { include: { product: true } },
          payments: { where: { status: "PAID" }, select: { amount: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="space-y-8 p-8">
      {view === "mine" && (
        <OfflineSnapshotWriter
          userId={entregadorId}
          role="ENTREGADOR"
          route="/entregas/minhas"
          data={deliveries.map((delivery) => ({
            id: delivery.id,
            orderId: delivery.order.id,
            status: delivery.status,
            customerName: delivery.order.customer.name,
            address: delivery.order.customer.address,
            phone: delivery.order.customer.phone,
            notes: delivery.order.notes,
            total: delivery.order.total,
            items: delivery.order.items.map((item) => ({
              productName: item.product.name,
              quantity: item.enteredQuantity ?? item.quantity,
              unit: item.enteredUnit ?? item.product.unit,
            })),
          }))}
        />
      )}
      <div>
        <h1 className="text-2xl font-semibold">
          {view === "mine"
            ? "Minhas entregas"
            : view === "available"
              ? "Entregas disponíveis"
              : view === "relation"
                ? "Relação de itens"
                : "Histórico de entregas"}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {view === "mine"
            ? "Consulte apenas os pedidos assumidos que ainda serão entregues."
            : view === "available"
              ? "Pedidos atribuídos que ainda aguardam um entregador."
              : view === "relation"
                ? "Confira os itens dos pedidos assumidos e registre faltas ou ocorrências."
                : "Entregas já concluídas, falhadas ou canceladas."}
        </p>
      </div>

      {deliveries.length === 0 && (
        <p className="rounded-lg border bg-white p-6 text-sm text-gray-400">
          {view === "mine"
            ? "Você não possui entregas assumidas em andamento."
            : view === "available"
              ? "Nenhuma entrega disponível no momento."
              : view === "relation"
                ? "Não há itens para conferir."
                : "Nenhum histórico de entrega encontrado."}
        </p>
      )}

      {view !== "relation" && <div className="space-y-3">
        {deliveries.map((delivery) => (
          <div
            key={delivery.id}
            className="flex flex-col justify-between gap-5 rounded-lg border bg-white p-4 lg:flex-row"
          >
            <div>
              <p className="font-medium">{delivery.order.customer.name}</p>
              <p className="text-sm text-gray-500">
                {delivery.order.customer.address ?? "Endereço não informado"}
              </p>
              {delivery.order.notes && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">Observações para entrega</p>
                  <p className="mt-1 whitespace-pre-wrap">{delivery.order.notes}</p>
                </div>
              )}
              <Link
                href={`/pedidos/${delivery.order.id}`}
                className="mt-1 inline-block text-sm font-medium text-sky-700 hover:underline"
              >
                Pedido #{delivery.order.id.slice(-6).toUpperCase()} · Detalhes
              </Link>
              <div className="mt-3 border-t pt-3 text-sm text-gray-600">
                <p className="font-medium text-gray-800">Itens do pedido</p>
                {delivery.order.items.map((item) => {
                  const quantity = item.enteredQuantity ?? item.quantity;
                  const unit = item.enteredUnit ?? item.product.unit;
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-baseline gap-2 py-1"
                    >
                      <span className="font-semibold tabular-nums">{formatQuantity(quantity)}</span>
                      <span className="text-gray-500">{unit}</span>
                      <span>{item.product.name}</span>
                      <span className="text-right font-medium tabular-nums">{formatBRL(item.total)}</span>
                    </div>
                  );
                })}
                <p className="mt-1 font-medium text-gray-800">
                  Total: {formatBRL(delivery.order.total)}
                </p>
              </div>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${statusColors[delivery.status]}`}
              >
                {statusLabels[delivery.status]}
              </span>
            </div>

            <div className="flex items-start gap-2">
              {view === "available" ? (
                <form
                  action={async () => {
                    "use server";
                    const result = await assignDeliveryAction(delivery.id);
                    if (result?.error === "Não autorizado.") {
                      redirect("/login?callbackUrl=%2Fentregas%2Fdisponiveis");
                    }
                  }}
                >
                  <button className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white">
                    Assumir entrega
                  </button>
                </form>
              ) : (
                <>
                  {view === "mine" &&
                    ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(delivery.status) &&
                    getOrderBalance(delivery.order) > 0 && (
                      <Link
                        href={`/pedidos/${delivery.order.id}#pagamentos`}
                        className="inline-flex h-9 items-center rounded-md border border-emerald-800 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                      >
                        Registrar pagamento
                      </Link>
                    )}
                  {delivery.status === "ASSIGNED" && (
                    <form
                      action={async () => {
                        "use server";
                        const result = await updateDeliveryStatusAction(
                          delivery.id,
                          "OUT_FOR_DELIVERY",
                        );
                        if (result?.error === "Não autorizado.") {
                          redirect("/login?callbackUrl=%2Fentregas%2Fminhas");
                        }
                        if (result?.error) {
                          redirect(`/entregas/minhas?erro=${encodeURIComponent(result.error)}`);
                        }
                      }}
                    >
                      <button className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white">
                        Iniciar entrega
                      </button>
                    </form>
                  )}
                  {delivery.status === "OUT_FOR_DELIVERY" && (
                    <>
                      <form
                        action={async () => {
                          "use server";
                          const result = await updateDeliveryStatusAction(
                            delivery.id,
                            "DELIVERED",
                          );
                          if (result?.error === "Não autorizado.") {
                            redirect("/login?callbackUrl=%2Fentregas%2Fminhas");
                          }
                          if (result?.error) {
                            redirect(`/entregas/minhas?erro=${encodeURIComponent(result.error)}`);
                          }
                        }}
                      >
                        <button
                          disabled={getOrderBalance(delivery.order) > 0}
                          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Marcar como entregue
                        </button>
                      </form>
                      {getOrderBalance(delivery.order) > 0 && (
                        <p className="max-w-40 text-xs text-slate-600">
                          Registre o pagamento total para concluir a entrega.
                        </p>
                      )}
                      <form
                        action={async () => {
                          "use server";
                          const result = await updateDeliveryStatusAction(
                            delivery.id,
                            "FAILED",
                          );
                          if (result?.error === "Não autorizado.") {
                            redirect("/login?callbackUrl=%2Fentregas%2Fminhas");
                          }
                          if (result?.error) {
                            redirect(`/entregas/minhas?erro=${encodeURIComponent(result.error)}`);
                          }
                        }}
                      >
                        <button className="rounded-md border px-3 py-1.5 text-sm font-medium text-red-600">
                          Registrar falha
                        </button>
                      </form>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>}

      {view === "relation" && deliveries.length > 0 && (
        <DeliveryChecklist
          deliveries={deliveries.map((delivery) => ({
            id: delivery.id,
            orderId: delivery.order.id,
            customerName: delivery.order.customer.name,
            address: delivery.order.customer.address,
            notes: delivery.order.notes,
            occurrences: delivery.occurrences,
            items: delivery.order.items.map((item) => ({
              id: item.id,
              productId: item.productId,
              productName: item.product.name,
              quantity: item.quantity,
              unit: item.product.unit,
              purchaseUnit: item.product.purchaseUnit,
              unitsPerPurchaseUnit: item.product.unitsPerPurchaseUnit,
              checked: item.checkedForDelivery,
            })),
          }))}
        />
      )}
    </main>
  );
}
