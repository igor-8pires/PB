import { prisma } from '@/lib/prisma'

export interface LocationOption {
  id: string
  name: string
  city: string
  state: string
}

export interface ProductOption {
  id: string
  name: string
  sku: number
  costPrice: number
  categoryId: string
  categoryName: string
  unit: string
  purchaseUnit: string | null
  unitsPerPurchaseUnit: number | null
}

export interface BasePriceDetail {
  id: string
  productId: string
  productName: string
  locationId: string
  locationName: string
  costPrice: number
  price: number
}

export interface SellerProfileDetail {
  sellerId: string
  sellerName: string
  sellerEmail: string
  defaultMarginPercent: number
  minMarginPercent: number
  maxMarginPercent: number
  allowOrderMarginChange: boolean
}

export interface QuantityDiscountDetail {
  id: string
  sellerId: string
  sellerName: string
  categoryId: string | null
  categoryName: string | null
  productId: string | null
  productName: string | null
  baseUnit: string | null
  unit: string | null
  minQuantity: number
  maxQuantity: number | null
  discountPercent: number
  active: boolean
}

// 1. Busca todas as localidades ativas
export async function getLocations(): Promise<LocationOption[]> {
  const locations = await prisma.location.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
    },
    orderBy: { name: 'asc' },
  })
  return locations
}

// 2. Busca todos os produtos ativos com seu custo base
export async function getProducts(): Promise<ProductOption[]> {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      sku: true,
      costPrice: true,
      categoryId: true,
      unit: true,
      purchaseUnit: true,
      unitsPerPurchaseUnit: true,
      category: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  })
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: Number(p.sku),
    costPrice: Number(p.costPrice),
    categoryId: p.categoryId,
    categoryName: p.category.name,
    unit: p.unit,
    purchaseUnit: p.purchaseUnit,
    unitsPerPurchaseUnit: p.unitsPerPurchaseUnit,
  }))

}

// 3. Busca a tabela de preços base cadastrados (Produto x Localidade)
export async function getBasePrices(): Promise<BasePriceDetail[]> {
  const basePrices = await prisma.basePrice.findMany({
    where: { active: true },
    include: {
      product: { select: { id: true, name: true, costPrice: true } },
      location: { select: { id: true, name: true, city: true, state: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return basePrices.map((bp) => ({
    id: bp.id,
    productId: bp.productId,
    productName: bp.product.name,
    locationId: bp.locationId,
    locationName: `${bp.location.name} (${bp.location.city}/${bp.location.state})`,
    costPrice: Number(bp.product.costPrice),
    price: Number(bp.price),
  }))
}

// 4. Busca todos os vendedores com seus perfis de margem cadastrados
export async function getSellersWithProfiles(): Promise<SellerProfileDetail[]> {
  const sellers = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'VENDEDOR'] }, active: true },
    select: {
      id: true,
      name: true,
      email: true,
      sellerProfile: {
        select: {
          defaultMarginPercent: true,
          minMarginPercent: true,
          maxMarginPercent: true,
          allowOrderMarginChange: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return sellers.map((s) => ({
    sellerId: s.id,
    sellerName: s.name,
    sellerEmail: s.email,
    defaultMarginPercent: s.sellerProfile ? Number(s.sellerProfile.defaultMarginPercent) : 0,
    minMarginPercent: s.sellerProfile ? Number(s.sellerProfile.minMarginPercent) : 0,
    maxMarginPercent: s.sellerProfile ? Number(s.sellerProfile.maxMarginPercent) : 0,
    allowOrderMarginChange: s.sellerProfile ? s.sellerProfile.allowOrderMarginChange : false,
  }))
}

export async function getQuantityDiscounts(): Promise<QuantityDiscountDetail[]> {
  const discounts = await prisma.quantityDiscount.findMany({
    include: {
      seller: { select: { name: true } },
      category: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ seller: { name: 'asc' } }, { minQuantity: 'asc' }],
  })

  return discounts.map((discount) => ({
    id: discount.id,
    sellerId: discount.sellerId,
    sellerName: discount.seller.name,
    categoryId: discount.categoryId,
    categoryName: discount.category?.name ?? null,
    productId: discount.productId,
    productName: discount.product?.name ?? null,
    baseUnit: discount.baseUnit,
    unit: discount.unit,
    minQuantity: discount.minQuantity,
    maxQuantity: discount.maxQuantity,
    discountPercent: Number(discount.discountPercent),
    active: discount.active,
  }))
}

// 5. Helper de simulação do Preço Final
// Fórmula do Sistema: FinalPrice = BasePrice * (1 + MarginPercent / 100)
export function calculateFinalPrice(basePrice: number, marginPercent: number): number {
  if (basePrice <= 0) return 0
  return basePrice * (1 + marginPercent / 100)
}
