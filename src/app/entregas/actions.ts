// src/app/entregas/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireEntregador() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ENTREGADOR") {
    throw new Error("Não autorizado.");
  }
  return session.user;
}

/**
 * Entregador "pega" uma entrega ainda sem entregador atribuído.
 * O `updateMany` com `courierId: null` na condição evita condição de
 * corrida: se dois entregadores clicarem quase ao mesmo tempo, só o
 * primeiro consegue (count = 1); o segundo recebe count = 0 e uma
 * mensagem, em vez de sobrescrever silenciosamente.
 */
export async function assignDeliveryAction(deliveryId: string) {
  let user;
  try {
    user = await requireEntregador();
  } catch {
    return { error: "Não autorizado." };
  }

  try {
    const result = await prisma.delivery.updateMany({
      where: { id: deliveryId, courierId: null },
      data: { courierId: user.id, assignedAt: new Date() },
    });

    if (result.count === 0) {
      return { error: "Essa entrega já foi assumida por outro entregador." };
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "ASSIGN_DELIVERY",
        entity: "Delivery",
        entityId: deliveryId,
        metadata: JSON.stringify({}),
      },
    });

    revalidatePath("/entregas");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Erro ao assumir entrega." };
  }
}

type DeliveryStatus = "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";

// Transições válidas — impede pular etapa (ex: ASSIGNED -> DELIVERED direto)
const allowedTransitions: Record<string, DeliveryStatus[]> = {
  ASSIGNED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
};

export async function updateDeliveryStatusAction(
  deliveryId: string,
  newStatus: DeliveryStatus,
) {
  let user;
  try {
    user = await requireEntregador();
  } catch {
    return { error: "Não autorizado." };
  }

  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return { error: "Entrega não encontrada." };
  if (delivery.courierId !== user.id) {
    return { error: "Essa entrega não é sua." };
  }

  const allowed = allowedTransitions[delivery.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { error: `Não é possível mudar de ${delivery.status} para ${newStatus}.` };
  }

  if (newStatus === "DELIVERED") {
    const order = await prisma.order.findUnique({
      where: { id: delivery.orderId },
      select: {
        total: true,
        payments: { where: { status: "PAID" }, select: { amount: true } },
      },
    });
    if (!order) return { error: "Pedido não encontrado." };

    const paidAmount = order.payments.reduce((total, payment) => total + payment.amount, 0);
    const balance = Math.round((order.total - paidAmount) * 100) / 100;
    if (balance > 0) {
      return { error: "Registre o pagamento total antes de marcar a entrega como concluída." };
    }
  }

  await prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      status: newStatus,
      ...(newStatus === "OUT_FOR_DELIVERY" ? { startedAt: new Date() } : {}),
      ...(newStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE_DELIVERY_STATUS",
      entity: "Delivery",
      entityId: deliveryId,
      metadata: JSON.stringify({ newStatus }),
    },
  });

  revalidatePath("/entregas");
  revalidatePath("/entregas/minhas");
  revalidatePath("/entregas/historico");
  revalidatePath("/entregas/relatorio");
  revalidatePath(`/pedidos/${delivery.orderId}`);
  return { success: true };
}

async function findOwnedAssignedDeliveryItem(deliveryId: string, orderItemId: string, courierId: string) {
  return prisma.orderItem.findFirst({
    where: {
      id: orderItemId,
      order: {
        is: {
          deliveries: {
            some: { id: deliveryId, courierId, status: "ASSIGNED" },
          },
        },
      },
    },
    include: { product: { select: { name: true } } },
  });
}

export async function updateDeliveryItemCheckAction(
  deliveryId: string,
  orderItemId: string,
  checked: boolean,
) {
  let user;
  try {
    user = await requireEntregador();
  } catch {
    return { error: "Não autorizado." };
  }

  if (
    typeof deliveryId !== "string" ||
    typeof orderItemId !== "string" ||
    typeof checked !== "boolean"
  ) {
    return { error: "Dados inválidos." };
  }

  const item = await findOwnedAssignedDeliveryItem(deliveryId, orderItemId, user.id);
  if (!item) return { error: "Item ou entrega não encontrado." };

  await prisma.orderItem.update({
    where: { id: item.id },
    data: { checkedForDelivery: checked },
  });
  revalidatePath("/entregas/relacao");
  return { success: true };
}

export async function recordDeliveryItemOccurrenceAction({
  deliveryId,
  orderItemId,
  missing,
  note,
}: {
  deliveryId: string;
  orderItemId: string;
  missing: boolean;
  note: string;
}) {
  let user;
  try {
    user = await requireEntregador();
  } catch {
    return { error: "Não autorizado." };
  }

  if (
    typeof deliveryId !== "string" ||
    typeof orderItemId !== "string" ||
    typeof missing !== "boolean" ||
    typeof note !== "string"
  ) {
    return { error: "Dados inválidos." };
  }

  const cleanedNote = note.trim();
  if (cleanedNote.length > 1000) {
    return { error: "A observação deve ter no máximo 1.000 caracteres." };
  }
  if (!missing && !cleanedNote) {
    return { error: "Informe uma observação para registrar." };
  }

  const item = await findOwnedAssignedDeliveryItem(deliveryId, orderItemId, user.id);
  if (!item) return { error: "Item ou entrega não encontrado." };

  const description = [
    missing ? `Falta de item: ${item.product.name}.` : `Ocorrência no item ${item.product.name}.`,
    cleanedNote,
  ]
    .filter(Boolean)
    .join(" ");

  await prisma.deliveryOccurrence.create({
    data: {
      deliveryId,
      createdBy: user.id,
      type: "OTHER",
      description,
    },
  });

  revalidatePath("/entregas/relacao");
  revalidatePath("/entregas/historico");
  return { success: true };
}
