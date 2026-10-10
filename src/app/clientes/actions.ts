// src/app/clientes/actions.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireVendedorOrAdmin() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && session.user.role !== "VENDEDOR")
  ) {
    throw new Error("Não autorizado.");
  }
  return session.user;
}

const customerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  document: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido.").optional().or(z.literal("")),
  address: z.string().optional(),
  locationId: z.string().min(1, "Localidade é obrigatória."),
  notes: z.string().optional(),
});

export async function createCustomerAction(input: z.infer<typeof customerSchema>) {
  try {
    await requireVendedorOrAdmin();
  } catch {
    return { error: "Não autorizado." };
  }

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const customer = await prisma.customer.create({
    data: {
      ...parsed.data,
      email: parsed.data.email || undefined,
    },
  });

  revalidatePath("/clientes");
  return { success: true, customerId: customer.id };
}

export async function updateCustomerAction(
  customerId: string,
  input: z.infer<typeof customerSchema>,
) {
  try {
    await requireVendedorOrAdmin();
  } catch {
    return { error: "Não autorizado." };
  }

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...parsed.data,
      email: parsed.data.email || undefined,
    },
  });

  revalidatePath("/clientes");
  return { success: true, customerId: customer.id };
}
