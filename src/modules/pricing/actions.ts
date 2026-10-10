"use server";

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// --- SCHEMAS DE VALIDAÇÃO ZOD ---

// Preço Base por Localidade
const setBasePriceSchema = z.object({
  productId: z.string().min(1, 'Selecione um produto'),
  locationId: z.string().min(1, 'Selecione uma localidade'),
  price: z.number().positive('O preço base deve ser maior que zero'),
})

// Configuração Comercial do Vendedor
const updateSellerProfileSchema = z.object({
  sellerId: z.string().min(1, 'Selecione um vendedor'),
  defaultMarginPercent: z.number().min(0, 'A margem padrão não pode ser negativa'),
  minMarginPercent: z.number().min(0, 'A margem mínima não pode ser negativa'),
  maxMarginPercent: z.number().min(0, 'A margem máxima não pode ser negativa'),
  allowOrderMarginChange: z.boolean(),
}).refine((data) => data.minMarginPercent <= data.defaultMarginPercent, {
  message: 'A margem mínima deve ser menor ou igual à margem padrão',
  path: ['minMarginPercent'],
}).refine((data) => data.defaultMarginPercent <= data.maxMarginPercent, {
  message: 'A margem padrão deve ser menor ou igual à margem máxima',
  path: ['defaultMarginPercent'],
})

type SetBasePriceInput = z.infer<typeof setBasePriceSchema>
type UpdateSellerProfileInput = z.infer<typeof updateSellerProfileSchema>

const quantityDiscountSchema = z.object({
  id: z.string().optional(),
  sellerId: z.string().min(1, 'Selecione um vendedor'),
  categoryId: z.string().nullable().optional(),
  productId: z.string().nullable().optional(),
  baseUnit: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  minQuantity: z.number().int().min(1, 'A quantidade mínima deve ser maior que zero'),
  maxQuantity: z.number().int().min(1).nullable(),
  discountPercent: z.number().gt(0).max(100, 'O desconto máximo é 100%'),
  active: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.maxQuantity !== null && data.maxQuantity < data.minQuantity) {
    ctx.addIssue({
      code: 'custom',
      message: 'A quantidade máxima deve ser maior ou igual à mínima',
      path: ['maxQuantity'],
    })
  }

  if (data.categoryId && data.productId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Selecione uma categoria ou um produto, não ambos.',
      path: ['productId'],
    })
  }

  const hasTarget = Boolean(data.categoryId || data.productId)
  if (hasTarget && (!data.baseUnit || !data.unit)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Informe a unidade-base e a unidade da faixa.',
      path: ['unit'],
    })
  }

  if (!hasTarget && (data.baseUnit || data.unit)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Faixas gerais não devem ter unidade específica.',
      path: ['unit'],
    })
  }
})

type SaveQuantityDiscountInput = z.infer<typeof quantityDiscountSchema>

// --- SERVER ACTIONS ---

// Server Action: Definir/Atualizar Preço Base por Localidade (com AuditLog)
export async function setBasePrice(data: SetBasePriceInput) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return { success: false, error: 'Apenas administradores podem alterar o preço base.' }
  }

  const parsed = setBasePriceSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors }
  }

  const { productId, locationId, price } = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Cria ou atualiza o registro de Preço Base
      const basePrice = await tx.basePrice.upsert({
        where: {
          productId_locationId: { productId, locationId },
        },
        update: { price, active: true },
        create: { productId, locationId, price, active: true },
      })

      // Auditoria obrigatória para alteração de Preço Base
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE_BASE_PRICE',
          entity: 'BasePrice',
          entityId: basePrice.id,
          metadata: JSON.stringify({ productId, locationId, newPrice: price }),
        },
      })

      return basePrice
    })

    revalidatePath('/dashboard/precos')
    return { success: true, data: result }
  } catch {
    return { success: false, error: 'Erro ao registrar preço base.' }
  }
}

// Server Action: Definir Margens do Vendedor (com AuditLog)
export async function updateSellerProfile(data: UpdateSellerProfileInput) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return { success: false, error: 'Vendedores não podem alterar sua própria margem padrão.' }
  }

  const parsed = updateSellerProfileSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors }
  }

  const { sellerId, defaultMarginPercent, minMarginPercent, maxMarginPercent, allowOrderMarginChange } = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.sellerProfile.upsert({
        where: { sellerId },
        update: {
          defaultMarginPercent,
          minMarginPercent,
          maxMarginPercent,
          allowOrderMarginChange,
        },
        create: {
          sellerId,
          defaultMarginPercent,
          minMarginPercent,
          maxMarginPercent,
          allowOrderMarginChange,
          active: true,
        },
      })

      // Auditoria obrigatória para alteração de Margens
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE_SELLER_PROFILE',
          entity: 'SellerProfile',
          entityId: profile.id,
          metadata: JSON.stringify({ sellerId, defaultMarginPercent, minMarginPercent, maxMarginPercent, allowOrderMarginChange }),
        },
      })

      return profile
    })

    revalidatePath('/dashboard/precos')
    return { success: true, data: result }
    } catch {
        return { success: false, error: 'Erro ao atualizar perfil de margem do vendedor.' }
      }
  }

    export async function saveQuantityDiscount(data: SaveQuantityDiscountInput) {
      const session = await auth()
      if (!session || session.user.role !== 'ADMIN') {
        return { success: false, error: 'Apenas administradores podem gerenciar descontos por volume.' }
      }

      const parsed = quantityDiscountSchema.safeParse(data)
      if (!parsed.success) {
        return { success: false, errors: parsed.error.flatten().fieldErrors }
      }

      const {
        id,
        sellerId,
        categoryId = null,
        productId = null,
        baseUnit = null,
        unit = null,
        minQuantity,
        maxQuantity,
        discountPercent,
        active,
      } = parsed.data

      if (productId) {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { unit: true, purchaseUnit: true, unitsPerPurchaseUnit: true },
        })
        if (!product || product.unit !== baseUnit) {
          return { success: false, error: 'O produto não possui a unidade-base selecionada.' }
        }
        if (unit !== product.unit && unit !== product.purchaseUnit) {
          return { success: false, error: 'A unidade selecionada não está configurada para o produto.' }
        }
        if (unit === product.purchaseUnit && (!product.unitsPerPurchaseUnit || product.unitsPerPurchaseUnit <= 0)) {
          return { success: false, error: 'Configure um fator de conversão válido para a unidade de compra.' }
        }
      }

      if (categoryId && baseUnit) {
        const products = await prisma.product.findMany({
          where: { categoryId, unit: baseUnit, active: true },
          select: { unit: true, purchaseUnit: true, unitsPerPurchaseUnit: true },
        })
        const supportsUnit = products.some((product) =>
          unit === product.unit ||
          (unit === product.purchaseUnit && Boolean(product.unitsPerPurchaseUnit && product.unitsPerPurchaseUnit > 0)),
        )
        if (!supportsUnit) {
          return { success: false, error: 'Nenhum produto ativo da categoria permite essa unidade e conversão.' }
        }
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const sameScope = await tx.quantityDiscount.findMany({
            where: {
              sellerId,
              active: true,
              ...(id ? { id: { not: id } } : {}),
            },
            select: {
              categoryId: true,
              productId: true,
              baseUnit: true,
              unit: true,
              minQuantity: true,
              maxQuantity: true,
            },
          })
          const matchingScope = sameScope.filter((discount) =>
            discount.categoryId === categoryId &&
            discount.productId === productId &&
            discount.baseUnit === baseUnit,
          )

          if (active && matchingScope.some((discount) => discount.unit !== unit)) {
            return {
              success: false as const,
              error: 'Todas as faixas deste escopo devem usar a mesma unidade.',
            }
          }

          if (active) {
            const hasOverlap = matchingScope.some((discount) =>
              minQuantity <= (discount.maxQuantity ?? Number.POSITIVE_INFINITY) &&
              (maxQuantity ?? Number.POSITIVE_INFINITY) >= discount.minQuantity,
            )

            if (hasOverlap) {
              return {
                success: false as const,
                error: 'Esta faixa se sobrepõe a outra faixa ativa deste vendedor.',
              }
            }
          }

          const discount = id
            ? await tx.quantityDiscount.update({
                where: { id },
                data: { sellerId, categoryId, productId, baseUnit, unit, minQuantity, maxQuantity, discountPercent, active },
              })
            : await tx.quantityDiscount.create({
                data: { sellerId, categoryId, productId, baseUnit, unit, minQuantity, maxQuantity, discountPercent, active },
              })

          await tx.auditLog.create({
            data: {
              userId: session.user.id,
              action: id ? 'UPDATE_QUANTITY_DISCOUNT' : 'CREATE_QUANTITY_DISCOUNT',
              entity: 'QuantityDiscount',
              entityId: discount.id,
              metadata: JSON.stringify({ sellerId, categoryId, productId, baseUnit, unit, minQuantity, maxQuantity, discountPercent, active }),
            },
          })

          return { success: true as const, data: discount }
        })

        if (result.success) revalidatePath('/dashboard/precos')
        return result
      } catch {
        return { success: false, error: 'Erro ao salvar desconto por volume.' }
      }
    }
