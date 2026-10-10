"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const paymentSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(["DINHEIRO", "PIX"]),
  amount: z.coerce.number().finite().positive(),
});

export async function recordPaymentAction(input: {
  orderId: string;
  method: "DINHEIRO" | "PIX";
  amount: number;
}) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "VENDEDOR", "ENTREGADOR"].includes(session.user.role)) {
    return { error: "Não autorizado." };
  }

  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { error: "Informe um valor válido e a forma de pagamento." };

  const amount = Math.round(parsed.data.amount * 100) / 100;
  if (amount <= 0) return { error: "O valor do pagamento deve ser maior que zero." };

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: parsed.data.orderId } });
      if (!order) throw new Error("Pedido não encontrado.");
      if (session.user.role !== "ADMIN" && order.sellerId !== session.user.id) {
        const delivery = session.user.role === "ENTREGADOR"
          ? await tx.delivery.findFirst({
              where: {
                orderId: order.id,
                courierId: session.user.id,
                status: { in: ["ASSIGNED", "OUT_FOR_DELIVERY"] },
              },
              select: { id: true },
            })
          : null;
        if (!delivery) throw new Error("Você não tem acesso a este pedido.");
      }
      if (order.status === "CANCELLED") throw new Error("Não é possível receber pagamento de um pedido cancelado.");

      const paid = await tx.payment.aggregate({
        where: { orderId: order.id, status: "PAID" },
        _sum: { amount: true },
      });
      const paidAmount = Math.round((paid._sum.amount ?? 0) * 100) / 100;
      const balance = Math.round((order.total - paidAmount) * 100) / 100;
      if (amount > balance) throw new Error("O pagamento não pode ultrapassar o saldo do pedido.");

      await tx.payment.create({
        data: {
          orderId: order.id,
          recordedById: session.user.id,
          method: parsed.data.method,
          amount,
          status: "PAID",
          paidAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "RECORD_PAYMENT",
          entity: "Payment",
          entityId: order.id,
          metadata: JSON.stringify({ method: parsed.data.method, amount }),
        },
      });
    });

    revalidatePath(`/pedidos/${parsed.data.orderId}`);
    revalidatePath("/entregas");
    revalidatePath("/entregas/relatorio");
    revalidatePath("/clientes");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao registrar pagamento." };
  }
}

const paymentTermsSchema = z.object({
  orderId: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function approvePaymentTermsAction(input: {
  orderId: string;
  dueDate?: string;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "Somente o administrador pode liberar prazo." };
  }

  const parsed = paymentTermsSchema.safeParse(input);
  if (!parsed.success) return { error: "Data de vencimento inválida." };

  const dueAt = new Date(`${parsed.data.dueDate}T23:59:59.999`);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now()) {
    return { error: "O vencimento deve ser hoje ou uma data futura." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: parsed.data.orderId } });
      if (!order) throw new Error("Pedido não encontrado.");
      if (order.status === "CANCELLED") throw new Error("Não é possível liberar prazo para um pedido cancelado.");

      const paid = await tx.payment.aggregate({
        where: { orderId: order.id, status: "PAID" },
        _sum: { amount: true },
      });
      if ((paid._sum.amount ?? 0) >= order.total) {
        throw new Error("Este pedido já está totalmente pago.");
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentTermsApprovedAt: new Date(),
          paymentTermsApprovedById: session.user.id,
          paymentDueAt: dueAt,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "APPROVE_PAYMENT_TERMS",
          entity: "Order",
          entityId: order.id,
          metadata: JSON.stringify({ dueAt }),
        },
      });
    });

    revalidatePath(`/pedidos/${parsed.data.orderId}`);
    revalidatePath("/clientes");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao liberar prazo." };
  }
}