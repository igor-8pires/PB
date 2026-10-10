// src/app/produtos/actions.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Não autorizado.");
  }
  return session.user;
}

const productSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  sku: z.number().int().positive().optional(),
  categoryId: z.string().min(1, "Categoria é obrigatória."),
  costPrice: z.coerce.number().nonnegative("Custo não pode ser negativo."),
  description: z.string().optional(),
  unit: z.string().trim().min(1, "Unidade base é obrigatória."),
  purchaseUnit: z.string().trim().nullable().optional(),
  unitsPerPurchaseUnit: z.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.purchaseUnit && !data.unitsPerPurchaseUnit) {
    ctx.addIssue({
      code: "custom",
      path: ["unitsPerPurchaseUnit"],
      message: "Informe o fator de conversão da unidade de compra.",
    });
  }

  if (
    data.purchaseUnit &&
    data.purchaseUnit.toLocaleLowerCase() === data.unit.toLocaleLowerCase()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["purchaseUnit"],
      message: "A unidade de compra deve ser diferente da unidade base.",
    });
  }
});

export async function createProductAction(input: z.infer<typeof productSchema>) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    return { error: "Não autorizado." };
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const productData = {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId,
      costPrice: parsed.data.costPrice,
      description: parsed.data.description,
      unit: parsed.data.unit,
      purchaseUnit: parsed.data.purchaseUnit || null,
      unitsPerPurchaseUnit: parsed.data.purchaseUnit
        ? parsed.data.unitsPerPurchaseUnit
        : null,
    };
    const product = await prisma.product.create({
      data: productData,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE_PRODUCT",
        entity: "Product",
        entityId: product.id,
        metadata: JSON.stringify({ name: product.name, sku: product.sku }),
      },
    });

    revalidatePath("/produtos");
    return { success: true, productId: product.id };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { error: "Já existe um produto com esse SKU." };
    }
    console.error(error);
    return { error: "Erro ao criar produto." };
  }
}

export async function updateProductAction(
  productId: string,
  input: z.infer<typeof productSchema>,
) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    return { error: "Não autorizado." };
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...parsed.data,
        purchaseUnit: parsed.data.purchaseUnit || null,
        unitsPerPurchaseUnit: parsed.data.purchaseUnit
          ? parsed.data.unitsPerPurchaseUnit
          : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_PRODUCT",
        entity: "Product",
        entityId: product.id,
        metadata: JSON.stringify({ name: product.name, sku: product.sku }),
      },
    });

    revalidatePath("/produtos");
    return { success: true, productId: product.id };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { error: "Já existe um produto com esse SKU." };
    }
    console.error(error);
    return { error: "Erro ao atualizar produto." };
  }
}

export async function toggleProductActiveAction(productId: string) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    return { error: "Não autorizado." };
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Produto não encontrado.");

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { active: !product.active },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE_PRODUCT" : "DEACTIVATE_PRODUCT",
      entity: "Product",
      entityId: updated.id,
      metadata: JSON.stringify({ name: updated.name }),
    },
  });

  revalidatePath("/produtos");
}

const categorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
});

export async function createCategoryAction(input: z.infer<typeof categorySchema>) {
  try {
    await requireAdmin();
  } catch {
    return { error: "Não autorizado." };
  }

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const category = await prisma.category.create({ data: parsed.data });
  revalidatePath("/produtos");
  return { success: true, category };
}
