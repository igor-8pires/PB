'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { convertToBaseUnit, calculateWeightedAverageCost, StockUnitError } from '@/lib/stock-unit'
import type { Prisma } from '@/generated/client'
import type { InventoryItem, StockMovementDetail } from './queries'

// --- SCHEMAS DE VALIDAÇÃO ZOD ---

const stockMovementTypeSchema = z.enum(['IN', 'OUT', 'ADJUSTMENT'])

const createStockMovementSchema = z.object({
  productId: z.string().min(1, 'Selecione um produto'),
  type: stockMovementTypeSchema,
  enteredUnit: z.string().min(1, 'Informe a unidade'),
  enteredQuantity: z.number().optional(),
  unitCost: z.number().nonnegative('Custo não pode ser negativo').optional(),
  reason: z.string().min(3, 'O motivo/observação é obrigatório (mínimo 3 caracteres)'),
}).superRefine((data, ctx) => {
  if (data.type !== 'ADJUSTMENT' && (!data.enteredQuantity || data.enteredQuantity <= 0)) {
    ctx.addIssue({ code: 'custom', path: ['enteredQuantity'], message: 'A quantidade deve ser maior que zero' })
  }

  if (data.type === 'ADJUSTMENT' && data.enteredQuantity === undefined && data.unitCost === undefined) {
    ctx.addIssue({ code: 'custom', path: ['enteredQuantity'], message: 'Informe a quantidade, o custo ou ambos' })
  }
})

type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>

// Client genérico: aceita tanto o prisma normal quanto o client de dentro
// de uma transação (tx), pra sempre ler o estado mais atual e consistente.
type DbClient = typeof prisma | Prisma.TransactionClient

// Helper interno para calcular saldo atual do produto no banco
export async function getProductCurrentStock(
  productId: string,
  db: DbClient = prisma,
): Promise<number> {
  const movements = await db.stockMovement.findMany({
    where: { productId },
    select: { type: true, quantity: true },
  })

  return movements.reduce((acc, m) => {
    if (m.type === 'OUT') return acc - m.quantity
    return acc + m.quantity // IN e ADJUSTMENT somam
  }, 0)
}

export async function getInventoryPageData() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      category: { select: { name: true } },
      stockMovements: { select: { type: true, quantity: true } },
    },
    orderBy: { name: 'asc' },
  })

  const summary: InventoryItem[] = products.map((product) => {
    const currentStock = product.stockMovements.reduce((total, movement) => {
      if (movement.type === 'OUT') return total - movement.quantity
      return total + movement.quantity
    }, 0)
    const costPrice = Number(product.costPrice)
    const status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' = currentStock <= 0
      ? 'OUT_OF_STOCK'
      : currentStock <= 10
        ? 'LOW_STOCK'
        : 'IN_STOCK'

    return {
      id: product.id,
      productId: product.id,
      productName: product.name,
      sku: Number(product.sku),
      categoryName: product.category?.name || 'Sem categoria',
      costPrice,
      currentStock,
      status,
      totalStockValue: currentStock > 0 ? currentStock * costPrice : 0,
      unit: product.unit,
      purchaseUnit: product.purchaseUnit,
      unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
    }
  })

  const movements = await prisma.stockMovement.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { name: true, sku: true, unit: true } },
      user: { select: { name: true } },
    },
  })

  const initialMovements: StockMovementDetail[] = movements.map((movement) => ({
    id: movement.id,
    productId: movement.productId,
    productName: movement.product?.name || 'Produto Removido',
    sku: Number(movement.product?.sku || 0),
    unit: movement.product?.unit || 'UN',
    userId: movement.userId,
    userName: movement.user?.name || 'Sistema',
    orderId: movement.orderId,
    type: movement.type,
    quantity: movement.quantity,
    enteredUnit: movement.enteredUnit,
    enteredQuantity: movement.enteredQuantity,
    unitCost: movement.unitCost,
    reason: movement.reason,
    createdAt: movement.createdAt.toISOString(),
  }))

  return {
    summary,
    movements: initialMovements,
    metrics: {
      totalProducts: summary.length,
      totalItemsInStock: summary.reduce((total, item) => total + Math.max(0, item.currentStock), 0),
      lowStockCount: summary.filter((item) => item.status === 'LOW_STOCK').length,
      outOfStockCount: summary.filter((item) => item.status === 'OUT_OF_STOCK').length,
      totalStockValue: summary.reduce((total, item) => total + item.totalStockValue, 0),
    },
  }
}

// --- SERVER ACTIONS ---

/**
 * Server Action: Movimentação Manual de Estoque (Entrada, Saída ou Ajuste)
 * Requer perfil ADMIN.
 *
 * Suporta dar entrada numa unidade diferente da unidade base do produto
 * (ex: entrada em "CAIXA", convertida pra "UN"), e — só em entradas —
 * um custo de lote que recalcula o custo médio ponderado do produto.
 */
export async function createStockMovement(data: CreateStockMovementInput) {
  const session = await auth()
  if (!session || !['ADMIN'].includes(session.user.role)) {
    return { success: false, error: 'Acesso negado. Apenas administradores podem registrar movimentações manuais.' }
  }

  const parsed = createStockMovementSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors }
  }

  const { productId, type, enteredUnit, enteredQuantity, unitCost, reason } = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } })
      if (!product) {
        throw new Error('Produto não encontrado.')
      }

      // Converte pra unidade base ANTES de qualquer validação de saldo
      const quantitySign = enteredQuantity !== undefined && enteredQuantity < 0 ? -1 : 1
      const baseQuantityRaw = enteredQuantity === undefined
        ? 0
        : convertToBaseUnit({
            enteredQuantity: Math.abs(enteredQuantity),
            enteredUnit,
            productUnit: product.unit,
            purchaseUnit: product.purchaseUnit,
            unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
          }) * quantitySign

      const baseQuantity = Math.round(baseQuantityRaw)
      if (type !== 'ADJUSTMENT' && baseQuantity <= 0) {
        throw new Error('Quantidade convertida resultou em zero.')
      }

      // IMPORTANTE: lê o saldo usando `tx`, não o `prisma` global — assim
      // enxerga qualquer movimentação feita nesta mesma transação e evita
      // condição de corrida entre lançamentos concorrentes.
      const stockBeforeThisMovement = await getProductCurrentStock(productId, tx)

      if (type === 'OUT' && stockBeforeThisMovement < baseQuantity) {
        throw new Error(
          `Estoque insuficiente. Saldo atual: ${stockBeforeThisMovement} ${product.unit}, tentativa de saída: ${baseQuantity} ${product.unit}.`,
        )
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId,
          userId: session.user.id,
          type,
          quantity: baseQuantity,
          enteredUnit,
          enteredQuantity,
          unitCost: type === 'IN' || type === 'ADJUSTMENT' ? unitCost ?? null : null,
          reason,
        },
      })

      // Entrada com custo informado -> recalcula o custo médio ponderado
      // do produto (spec de vocês: "alterar o preço daquele lote").
      if ((type === 'IN' || type === 'ADJUSTMENT') && unitCost !== undefined) {
        const newCostPrice = type === 'ADJUSTMENT'
          ? unitCost
          : calculateWeightedAverageCost({
              stockBeforeEntry: stockBeforeThisMovement,
              currentCostPrice: product.costPrice,
              enteredQuantityBaseUnit: baseQuantity,
              unitCost,
            })

        await tx.product.update({
          where: { id: productId },
          data: { costPrice: newCostPrice },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'STOCK_MOVEMENT',
          entity: 'StockMovement',
          entityId: movement.id,
          metadata: JSON.stringify({
            productId,
            productName: product.name,
            type,
            enteredUnit,
            enteredQuantity,
            baseQuantity,
            unitCost,
            reason,
          }),
        },
      })

      return movement
    })

    revalidatePath('/dashboard/estoque')
    revalidatePath('/estoque')
    return { success: true, data: result }
  } catch (error: unknown) {
    const message =
      error instanceof StockUnitError || error instanceof Error
        ? error.message
        : 'Erro ao registrar movimentação de estoque.'
    return { success: false, error: message }
  }
}

/**
 * Server Action Interna: Baixa Automática de Estoque na Confirmação de Pedido
 */
export async function processOrderStockOut(orderId: string, userId: string, items: { productId: string; quantity: number }[]) {
  return await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const currentStock = await getProductCurrentStock(item.productId, tx)

      if (currentStock < item.quantity) {
        throw new Error(`Estoque insuficiente para o produto ID ${item.productId}. Disponível: ${currentStock}, Solicitado: ${item.quantity}.`)
      }

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          userId,
          orderId,
          type: 'OUT',
          quantity: item.quantity,
          reason: `Baixa automática referente à confirmação do Pedido #${orderId}`,
        },
      })
    }
  })
}

/**
 * Server Action Interna: Devolução de Estoque ao Cancelar Pedido
 */
export async function processOrderStockReturn(orderId: string, userId: string, items: { productId: string; quantity: number }[]) {
  return await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          userId,
          orderId,
          type: 'IN',
          quantity: item.quantity,
          reason: `Estorno de estoque referente ao cancelamento do Pedido #${orderId}`,
        },
      })
    }
  })
}
