// src/app/pedidos/novo/actions.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateItemPrice,
  PricingError,
  resolveQuantityDiscountPercents,
} from "@/lib/pricing";
import { convertToBaseUnit, StockUnitError } from "@/lib/stock-unit";

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  enteredUnit: z.string().min(1).optional(),
  marginPercent: z.coerce.number().optional(),
  finalUnitPrice: z.coerce.number().positive().optional(),
});

async function resolveOrderDiscounts(
  sellerId: string,
  items: Array<z.infer<typeof itemSchema>>,
) {
  const products = await prisma.product.findMany({
    where: {
      id: { in: [...new Set(items.map((item) => item.productId))] },
      active: true,
    },
    select: {
      id: true,
      categoryId: true,
      unit: true,
      purchaseUnit: true,
      unitsPerPurchaseUnit: true,
    },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  const discountItems = items.map((item) => {
    const product = productById.get(item.productId);
    if (!product) throw new PricingError("Produto não encontrado ou inativo.");

    const enteredUnit = item.enteredUnit ?? product.unit;
    let baseQuantity: number;
    try {
      baseQuantity = convertToBaseUnit({
        enteredQuantity: item.quantity,
        enteredUnit,
        productUnit: product.unit,
        purchaseUnit: product.purchaseUnit,
        unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
      });
    } catch (error) {
      if (error instanceof StockUnitError) throw new PricingError(error.message);
      throw error;
    }

    if (!Number.isInteger(baseQuantity)) {
      throw new PricingError("A conversão deve resultar em uma quantidade inteira da unidade base.");
    }

    return {
      productId: product.id,
      categoryId: product.categoryId,
      baseUnit: product.unit,
      purchaseUnit: product.purchaseUnit,
      unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
      baseQuantity,
    };
  });

  const rules = await prisma.quantityDiscount.findMany({
    where: { sellerId, active: true },
  });
  return resolveQuantityDiscountPercents(rules, discountItems);
}

async function calculateOrderItemPrice({
  sellerId,
  customerId,
  item,
  quantityDiscountPercent,
}: {
  sellerId: string;
  customerId: string;
  item: z.infer<typeof itemSchema>;
  quantityDiscountPercent?: number;
}) {
  const product = await prisma.product.findUnique({
    where: { id: item.productId },
    select: {
      unit: true,
      purchaseUnit: true,
      unitsPerPurchaseUnit: true,
    },
  });

  if (!product) throw new PricingError("Produto não encontrado ou inativo.");

  const enteredUnit = item.enteredUnit ?? product.unit;
  let stockQuantity: number;
  try {
    stockQuantity = convertToBaseUnit({
      enteredQuantity: item.quantity,
      enteredUnit,
      productUnit: product.unit,
      purchaseUnit: product.purchaseUnit,
      unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
    });
  } catch (error) {
    if (error instanceof StockUnitError) {
      throw new PricingError(error.message);
    }
    throw error;
  }

  if (!Number.isInteger(stockQuantity)) {
    throw new PricingError("A conversão deve resultar em uma quantidade inteira da unidade base.");
  }

  const unitFactor = enteredUnit === product.unit
    ? 1
    : product.unitsPerPurchaseUnit ?? 0;
  if (unitFactor <= 0) {
    throw new PricingError("Fator de conversão inválido para a unidade selecionada.");
  }

  const calculated = await calculateItemPrice({
    sellerId,
    customerId,
    productId: item.productId,
    quantity: stockQuantity,
    quantityDiscountPercent,
    requestedMarginPercent: item.marginPercent,
    requestedUnitPrice:
      item.finalUnitPrice === undefined
        ? undefined
        : item.finalUnitPrice / unitFactor,
  });

  return {
    ...calculated,
    quantity: item.quantity,
    enteredQuantity: item.quantity,
    enteredUnit,
    stockQuantity,
    basePrice: calculated.basePrice * unitFactor,
    unitPrice: calculated.unitPrice * unitFactor,
  };
}

async function calculateOrderItemsPrice({
  sellerId,
  customerId,
  items,
}: {
  sellerId: string;
  customerId: string;
  items: Array<z.infer<typeof itemSchema>>;
}) {
  const discounts = await resolveOrderDiscounts(sellerId, items);
  return Promise.all(
    items.map((item, index) =>
      calculateOrderItemPrice({
        sellerId,
        customerId,
        item,
        quantityDiscountPercent: discounts[index],
      }),
    ),
  );
}

export async function calculateItemPriceAction(input: {
  customerId: string;
  productId: string;
  quantity: number;
  enteredUnit?: string;
  marginPercent?: number;
  finalUnitPrice?: number;
  discountItems?: Array<Pick<z.infer<typeof itemSchema>, "productId" | "quantity" | "enteredUnit">>;
}) {
  const session = await auth();

  if (!session?.user || !["ADMIN", "VENDEDOR"].includes(session.user.role)) {
    return { error: "Não autorizado." };
  }

  try {
    const item = {
      productId: input.productId,
      quantity: input.quantity,
      enteredUnit: input.enteredUnit,
      marginPercent: input.marginPercent,
      finalUnitPrice: input.finalUnitPrice,
    };
    const discounts = await resolveOrderDiscounts(session.user.id, [
      ...(input.discountItems ?? []),
      item,
    ]);
    const data = await calculateOrderItemPrice({
      sellerId: session.user.id,
      customerId: input.customerId,
      item,
      quantityDiscountPercent: discounts[discounts.length - 1],
    });
    return { data };
  } catch (error) {
    if (error instanceof PricingError) {
      return { error: error.message };
    }
    console.error(error);
    return { error: "Erro ao calcular preço." };
  }
}

const calculateOrderItemsSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(itemSchema).min(1).max(100),
});

export async function calculateOrderItemsPriceAction(
  input: z.infer<typeof calculateOrderItemsSchema>,
) {
  const session = await auth();

  if (!session?.user || !["ADMIN", "VENDEDOR"].includes(session.user.role)) {
    return { error: "Não autorizado." };
  }

  const parsed = calculateOrderItemsSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  try {
    const data = await calculateOrderItemsPrice({
      sellerId: session.user.id,
      customerId: parsed.data.customerId,
      items: parsed.data.items,
    });
    return { data };
  } catch (error) {
    if (error instanceof PricingError) return { error: error.message };
    console.error(error);
    return { error: "Erro ao calcular preços do pedido." };
  }
}

const createOrderSchema = z.object({
  customerId: z.string().min(1),
  offlineSyncId: z.string().min(1).max(128).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(itemSchema).min(1),
});

class OutstandingPaymentError extends Error {}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function createOrderAction(
  input: z.infer<typeof createOrderSchema>,
) {
  const session = await auth();

  if (!session?.user || !["ADMIN", "VENDEDOR"].includes(session.user.role)) {
    return { error: "Não autorizado." };
  }

  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  const sellerId = session.user.id;
  const { customerId, offlineSyncId, notes, items } = parsed.data;

  try {
    if (offlineSyncId) {
      const existingOrder = await prisma.order.findUnique({
        where: { offlineSyncId },
        select: { id: true, sellerId: true },
      });
      if (existingOrder) {
        if (existingOrder.sellerId !== sellerId) return { error: "Não autorizado." };
        revalidatePath("/pedidos");
        revalidatePath("/dashboard");
        return { success: true, orderId: existingOrder.id };
      }
    }

    // Recalcula TUDO no backend, ignorando qualquer preço vindo do
    // cliente — design.md §4: "o preço final nunca deve ser calculado
    // ou validado somente no frontend".
    const calculatedItems = await calculateOrderItemsPrice({
      sellerId,
      customerId,
      items,
    });

    const requestedStockByProduct = calculatedItems.reduce((totals, item) => {
      totals.set(
        item.productId,
        (totals.get(item.productId) ?? 0) + item.stockQuantity,
      );
      return totals;
    }, new Map<string, number>());
    const insufficientStock = calculatedItems.find(
      (item) =>
        !item.stockOk ||
        (requestedStockByProduct.get(item.productId) ?? 0) > item.availableStock,
    );
    if (insufficientStock) {
      return {
        error: `Estoque insuficiente para ${insufficientStock.productName} (disponível: ${insufficientStock.availableStock}).`,
      };
    }

    const subtotal = calculatedItems.reduce(
      (sum, item) =>
        sum +
        item.basePrice *
          (1 + item.defaultMarginPercent / 100) *
          (1 - item.discountPercent / 100) *
          item.quantity,
      0,
    );
    const total = calculatedItems.reduce((sum, item) => sum + item.total, 0);
    const discount = Math.max(subtotal - total, 0);
    const appliedMarginPercent = calculatedItems[0]?.marginPercent ?? 0;
    const defaultMarginPercent = calculatedItems[0]?.defaultMarginPercent ?? 0;

    // Tudo dentro de uma transação: se qualquer passo falhar, nada é
    // salvo — design.md §7.
    const order = await prisma.$transaction(async (tx) => {
      const previousOrders = await tx.order.findMany({
        where: { customerId, status: { not: "CANCELLED" } },
        select: {
          id: true,
          total: true,
          paymentTermsApprovedAt: true,
          paymentDueAt: true,
          payments: {
            where: { status: "PAID" },
            select: { amount: true },
          },
        },
      });
      const now = new Date();
      const unpaidOrder = previousOrders.find((previousOrder) => {
        const paid = previousOrder.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const balance = Math.round((previousOrder.total - paid) * 100) / 100;
        const hasValidDateExtension =
          previousOrder.paymentTermsApprovedAt !== null &&
          previousOrder.paymentDueAt !== null &&
          previousOrder.paymentDueAt > now;
        return balance > 0 && !hasValidDateExtension;
      });
      if (unpaidOrder) {
        throw new OutstandingPaymentError(
          `O pedido #${unpaidOrder.id.slice(-6).toUpperCase()} possui saldo pendente. Registre o recebimento no histórico do cliente antes de criar outra venda.`,
        );
      }

      const createdOrder = await tx.order.create({
        data: {
          customerId,
          sellerId,
          status: "CONFIRMED",
          defaultMarginPercent,
          appliedMarginPercent,
          subtotal,
          discount,
          total,
          notes: notes || null,
          ...(offlineSyncId ? { offlineSyncId } : {}),
          items: {
            create: calculatedItems.map((item) => ({
              productId: item.productId,
              quantity: item.stockQuantity,
              enteredQuantity: item.enteredQuantity,
              enteredUnit: item.enteredUnit,
              basePrice: item.basePrice,
              marginPercent: item.marginPercent,
              quantityDiscountPercent: item.discountPercent,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
        },
      });

      for (const item of calculatedItems) {
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            userId: sellerId,
            orderId: createdOrder.id,
            type: "OUT",
            quantity: item.stockQuantity,
            reason: `Venda - pedido ${createdOrder.id}`,
          },
        });
      }

      await tx.delivery.create({
        data: {
          orderId: createdOrder.id,
          status: "ASSIGNED",
        },
      });

      await tx.auditLog.create({
        data: {
          userId: sellerId,
          action: "CREATE_ORDER",
          entity: "Order",
          entityId: createdOrder.id,
          metadata: JSON.stringify({
            total,
            itemCount: calculatedItems.length,
          }),
        },
      });

      return createdOrder;
    });

    revalidatePath("/pedidos");
    revalidatePath("/dashboard");
    return { success: true, orderId: order.id };
  } catch (error) {
    if (offlineSyncId && isUniqueConstraintError(error)) {
      const existingOrder = await prisma.order.findUnique({
        where: { offlineSyncId },
        select: { id: true, sellerId: true },
      });
      if (existingOrder?.sellerId === sellerId) {
        revalidatePath("/pedidos");
        revalidatePath("/dashboard");
        return { success: true, orderId: existingOrder.id };
      }
    }
    if (error instanceof OutstandingPaymentError) return { error: error.message };
    if (error instanceof PricingError) {
      return { error: error.message };
    }
    console.error(error);
    return { error: "Erro ao criar pedido." };
  }
}
