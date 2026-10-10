import { prisma } from '@/lib/prisma'

export interface InventoryItem {
  id: string
  productId: string
  productName: string
  sku: number
  categoryName: string
  costPrice: number
  currentStock: number
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  totalStockValue: number
  unit: string
  purchaseUnit: string | null
  unitsPerPurchaseUnit: number | null
}

export interface StockMovementDetail {
  id: string
  productId: string
  productName: string
  sku: number
  unit: string
  userId: string
  userName: string
  orderId?: string | null
  type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  enteredUnit: string | null
  enteredQuantity: number | null
  unitCost: number | null
  reason: string | null
  createdAt: string
}

export interface InventoryMetrics {
  totalProducts: number
  totalItemsInStock: number
  lowStockCount: number
  outOfStockCount: number
  totalStockValue: number
}

/**
 * Busca a posição atual de estoque para todos os produtos
 */
export async function getInventorySummary(): Promise<InventoryItem[]> {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      category: { select: { name: true } },
      stockMovements: { select: { type: true, quantity: true } },
    },
    orderBy: { name: 'asc' },
  })

  return products.map((product) => {
    const currentStock = product.stockMovements.reduce((acc, m) => {
      if (m.type === 'OUT') return acc - m.quantity
      return acc + m.quantity
    }, 0)

    let status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK'
    if (currentStock <= 0) {
      status = 'OUT_OF_STOCK'
    } else if (currentStock <= 10) {
      status = 'LOW_STOCK'
    }

    const costPrice = Number(product.costPrice)
    const totalStockValue = currentStock > 0 ? currentStock * costPrice : 0

    return {
      id: product.id,
      productId: product.id,
      productName: product.name,
      sku: Number(product.sku),
      categoryName: product.category?.name || 'Sem categoria',
      costPrice,
      currentStock,
      status,
      totalStockValue,
      unit: product.unit,
      purchaseUnit: product.purchaseUnit,
      unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
    }
  })
}

/**
 * Busca o histórico de movimentações de estoque
 */
export async function getStockMovements(limit = 100): Promise<StockMovementDetail[]> {
  const movements = await prisma.stockMovement.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { name: true, sku: true, unit: true } },
      user: { select: { name: true } },
    },
  })

  return movements.map((m) => ({
    id: m.id,
    productId: m.productId,
    productName: m.product?.name || 'Produto Removido',
    sku: Number(m.product?.sku || 0),
    unit: m.product?.unit || 'UN',
    userId: m.userId,
    userName: m.user?.name || 'Sistema',
    orderId: m.orderId,
    type: m.type as 'IN' | 'OUT' | 'ADJUSTMENT',
    quantity: m.quantity,
    enteredUnit: m.enteredUnit,
    enteredQuantity: m.enteredQuantity,
    unitCost: m.unitCost,
    reason: m.reason,
    createdAt: m.createdAt.toISOString(),
  }))
}

/**
 * Consolida as métricas gerais do estoque
 */
export async function getInventoryMetrics(): Promise<InventoryMetrics> {
  const summary = await getInventorySummary()

  const totalProducts = summary.length
  const totalItemsInStock = summary.reduce((acc, item) => acc + Math.max(0, item.currentStock), 0)
  const lowStockCount = summary.filter((item) => item.status === 'LOW_STOCK').length
  const outOfStockCount = summary.filter((item) => item.status === 'OUT_OF_STOCK').length
  const totalStockValue = summary.reduce((acc, item) => acc + item.totalStockValue, 0)

  return {
    totalProducts,
    totalItemsInStock,
    lowStockCount,
    outOfStockCount,
    totalStockValue,
  }
}
