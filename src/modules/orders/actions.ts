'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { Prisma } from '@/generated/client'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Schemas Zod de Validação de Pedidos
export const orderItemSchema = z.object({
  productId: z.string().min(1, 'Produto é obrigatório'),
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  locationId: z.string().min(1, 'Localidade é obrigatória'),
})

export const createOrderSchema = z.object({
  customerId: z.string().optional().nullable(),
  customerName: z.string().min(2, 'Informe o nome do cliente'),
  locationId: z.string().min(1, 'Selecione a localidade'),
  paymentMethod: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO', 'ON_DELIVERY']),
  items: z.array(orderItemSchema).min(1, 'O pedido deve ter pelo menos um item'),
  notes: z.string().optional(),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>

export function mapPaymentMethod(method: string) {
  const map: Record<string, 'DINHEIRO' | 'PIX' | 'CARTAO' | 'OUTRO'> = {
    CASH: 'DINHEIRO',
    PIX: 'PIX',
    CREDIT_CARD: 'CARTAO',
    DEBIT_CARD: 'CARTAO',
    BOLETO: 'OUTRO',
    ON_DELIVERY: 'OUTRO',
  }

  return map[method] ?? 'DINHEIRO'
}

// Helper de cálculo de descontos por volume
async function getVolumeDiscountPercent(
  tx: Prisma.TransactionClient,
  sellerId: string,
  quantity: number,
): Promise<number> {
  const discountRule = await tx.quantityDiscount.findFirst({
    where: {
      sellerId,
      active: true,
      minQuantity: { lte: quantity },
      OR: [{ maxQuantity: null }, { maxQuantity: { gte: quantity } }],
    },
    orderBy: { minQuantity: 'desc' },
  })

  return discountRule ? Number(discountRule.discountPercent) : 0
}

// Server Action: Criar Pedido Online
export async function createOrderAction(data: CreateOrderInput) {
  const session = await auth()
  if (!session) {
    return { success: false, error: 'Sessão expirada ou usuário não autenticado.' }
  }

  const parsed = createOrderSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors }
  }

  const { customerName, locationId, paymentMethod, items, notes } = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verificar perfil de margem do vendedor
      const sellerProfile = await tx.sellerProfile.findUnique({
        where: { sellerId: session.user.id },
      })

      const marginPercent = sellerProfile ? Number(sellerProfile.defaultMarginPercent) : 0
      const defaultMarginPercent = marginPercent

      let calculatedOrderTotal = 0
      const processedItems = []

      // 2. Processar cada item do pedido
      for (const item of items) {
        // Checar estoque disponível
        const stockAgg = await tx.stockMovement.aggregate({
          where: { productId: item.productId },
          _sum: { quantity: true },
        })
        const currentStock = stockAgg._sum.quantity || 0

        if (currentStock < item.quantity) {
          const product = await tx.product.findUnique({ where: { id: item.productId } })
          throw new Error(`Estoque insuficiente para "${product?.name || item.productId}". Disponível: ${currentStock}`)
        }

        // Buscar preço base para a localidade
        const basePriceRecord = await tx.basePrice.findUnique({
          where: {
            productId_locationId: { productId: item.productId, locationId },
          },
          include: { product: true },
        })

        if (!basePriceRecord || !basePriceRecord.active) {
          throw new Error(`Preço base não configurado para o produto na localidade selecionada.`)
        }

        const basePrice = Number(basePriceRecord.price)
        const discountPercent = await getVolumeDiscountPercent(tx, session.user.id, item.quantity)

        // Fórmula Oficial: Final = BasePrice * (1 + Margin/100) * (1 - Discount/100)
        const unitPrice = basePrice * (1 + marginPercent / 100) * (1 - discountPercent / 100)
        const itemTotal = unitPrice * item.quantity

        calculatedOrderTotal += itemTotal

        processedItems.push({
          productId: item.productId,
          quantity: item.quantity,
          basePrice,
          marginPercent,
          discountPercent,
          quantityDiscountPercent: discountPercent,
          unitPrice,
          total: itemTotal,
        })
      }

      const subtotal = processedItems.reduce(
        (sum, item) =>
          sum +
          item.basePrice *
            (1 + defaultMarginPercent / 100) *
            (1 - item.quantityDiscountPercent / 100) *
            item.quantity,
        0,
      )
      const discount = Math.max(subtotal - calculatedOrderTotal, 0)

      // 3. Criar registro do Pedido
      const order = await tx.order.create({
        data: {
          seller: { connect: { id: session.user.id } },
          customer: { connect: { id: customerName } },
          status: 'CONFIRMED',
          defaultMarginPercent,
          appliedMarginPercent: marginPercent,
          subtotal,
          discount,
          total: calculatedOrderTotal,
          notes: notes || null,
          items: {
            create: processedItems.map((item) => ({
              product: { connect: { id: item.productId } },
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              basePrice: item.basePrice,
              marginPercent: item.marginPercent,
              quantityDiscountPercent: item.quantityDiscountPercent,
            })),
          },
        },
      })

      // 4. Registrar Saída de Estoque (StockMovement OUT)
      for (const i of processedItems) {
        await tx.stockMovement.create({
          data: {
            productId: i.productId,
            userId: session.user.id,
            orderId: order.id,
            type: 'OUT',
            quantity: -Math.abs(i.quantity),
            reason: `Venda realizada - Pedido #${order.id}`,
          },
        })
      }

      // 5. AuditLog da Transação
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_ORDER',
          entity: 'Order',
          entityId: order.id,
          metadata: JSON.stringify({
            total: calculatedOrderTotal,
            itemCount: items.length,
            paymentMethod,
          }),
        },
      })

      return order
    })

    revalidatePath('/dashboard/pedidos')
    revalidatePath('/dashboard/estoque')
    return { success: true, orderId: result.id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao processar o pedido.'
    return { success: false, error: message }
  }
}

// Server Action: Sincronização de Pedido Offline
export async function syncOfflineOrderAction(draft: {
  localId: string
  customerName: string
  locationId: string
  appliedMarginPercent?: number
  items: Array<{ productId: string; productName: string; quantity: number }>
  paymentMethod: string
  notes?: string
  createdAt: string
}) {
  const session = await auth()
  if (!session) {
    return { success: false, error: 'Sessão expirada ou usuário não autenticado.' }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Validar Margem do Vendedor contra limites permitidos
      const sellerProfile = await tx.sellerProfile.findUnique({
        where: { sellerId: session.user.id },
      })

      const marginPercent = draft.appliedMarginPercent ?? (sellerProfile ? Number(sellerProfile.defaultMarginPercent) : 0)
      const defaultMarginPercent = sellerProfile ? Number(sellerProfile.defaultMarginPercent) : 0

      if (sellerProfile) {
        const minMargin = Number(sellerProfile.minMarginPercent)
        const maxMargin = Number(sellerProfile.maxMarginPercent)
        if (marginPercent < minMargin || marginPercent > maxMargin) {
          throw new Error(`Margem de ${marginPercent}% está fora dos limites autorizados (${minMargin}% - ${maxMargin}%).`)
        }
      }

      let orderTotal = 0
      const processedItems = []

      // 2. Recalcular e verificar estoque de cada item no Servidor
      for (const item of draft.items) {
        const stockAgg = await tx.stockMovement.aggregate({
          where: { productId: item.productId },
          _sum: { quantity: true },
        })
        const currentStock = stockAgg._sum.quantity || 0

        if (currentStock < item.quantity) {
          throw new Error(`Estoque insuficiente para "${item.productName}". Disponível: ${currentStock}, Solicitado: ${item.quantity}`)
        }

        const basePriceRecord = await tx.basePrice.findUnique({
          where: {
            productId_locationId: { productId: item.productId, locationId: draft.locationId },
          },
        })

        if (!basePriceRecord) {
          throw new Error(`Preço base não encontrado para "${item.productName}" na localidade.`)
        }

        const basePrice = Number(basePriceRecord.price)
        const discountPercent = await getVolumeDiscountPercent(tx, session.user.id, item.quantity)
        const unitPrice = basePrice * (1 + marginPercent / 100) * (1 - discountPercent / 100)
        const itemTotal = unitPrice * item.quantity

        orderTotal += itemTotal

        processedItems.push({
          productId: item.productId,
          quantity: item.quantity,
          basePrice,
          marginPercent,
          quantityDiscountPercent: discountPercent,
          unitPrice,
          total: itemTotal,
        })
      }

      const subtotal = processedItems.reduce(
        (sum, item) =>
          sum +
          item.basePrice *
            (1 + defaultMarginPercent / 100) *
            (1 - item.quantityDiscountPercent / 100) *
            item.quantity,
        0,
      )
      const discount = Math.max(subtotal - orderTotal, 0)

      // 3. Gravar Pedido Oficial no Banco (Turso)
      const order = await tx.order.create({
        data: {
          seller: { connect: { id: session.user.id } },
          customer: { connect: { id: draft.customerName } },
          status: 'CONFIRMED',
          defaultMarginPercent,
          appliedMarginPercent: marginPercent,
          subtotal,
          discount,
          total: orderTotal,
          notes: draft.notes ? `[OFFLINE SYNC] ${draft.notes}` : '[OFFLINE SYNC]',
          items: {
            create: processedItems.map((item) => ({
              product: { connect: { id: item.productId } },
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              basePrice: item.basePrice,
              marginPercent: item.marginPercent,
              quantityDiscountPercent: item.quantityDiscountPercent,
            })),
          },
        },
      })

      // 4. Dar baixa no Estoque
      for (const i of processedItems) {
        await tx.stockMovement.create({
          data: {
            productId: i.productId,
            userId: session.user.id,
            orderId: order.id,
            type: 'OUT',
            quantity: -Math.abs(i.quantity),
            reason: `Venda offline sincronizada (Pedido #${order.id})`,
          },
        })
      }

      // 5. Auditoria de Sincronização
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_ORDER_OFFLINE_SYNC',
          entity: 'Order',
          entityId: order.id,
          metadata: JSON.stringify({
            localDraftId: draft.localId,
            offlineCreatedAt: draft.createdAt,
            total: orderTotal,
          }),
        },
      })

      return order
    })

    revalidatePath('/dashboard/pedidos')
    revalidatePath('/dashboard/estoque')

    return { success: true, orderId: result.id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao sincronizar rascunho offline.'
    return { success: false, error: message }
  }
}
