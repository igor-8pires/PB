'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function getOfflineSnapshots() {
  const session = await auth()
  if (!session?.user) return { success: false as const }

  const userId = session.user.id
  const role = session.user.role
  const isCourier = role === 'ENTREGADOR'

  const [products, customers, locations, basePrices, sellerProfile, quantityDiscounts, orders, deliveries] =
    await Promise.all([
      prisma.product.findMany({
        include: { category: true },
        orderBy: { name: 'asc' },
      }),
      isCourier ? Promise.resolve([]) : prisma.customer.findMany({ orderBy: { name: 'asc' } }),
      isCourier
        ? Promise.resolve([])
        : prisma.location.findMany({
            where: { active: true },
            select: { id: true, name: true, city: true, state: true },
            orderBy: { name: 'asc' },
          }),
      isCourier
        ? Promise.resolve([])
        : prisma.basePrice.findMany({ where: { active: true } }),
      isCourier
        ? Promise.resolve(null)
        : prisma.sellerProfile.findUnique({ where: { sellerId: userId } }),
      isCourier
        ? Promise.resolve([])
        : prisma.quantityDiscount.findMany({ where: { sellerId: userId, active: true } }),
      isCourier
        ? Promise.resolve([])
        : prisma.order.findMany({
            where: role === 'ADMIN' ? {} : { sellerId: userId },
            include: { customer: true, seller: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          }),
      isCourier
        ? prisma.delivery.findMany({
            where: {
              courierId: userId,
              status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] },
            },
            include: {
              order: {
                include: {
                  customer: true,
                  items: { include: { product: true } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
    ])

  const snapshots = [
    ...(!isCourier
      ? [
          {
            route: '/pedidos',
            data: orders.map((order) => ({
              id: order.id,
              customerName: order.customer.name,
              sellerName: order.seller.name,
              status: order.status,
              total: Number(order.total),
              createdAt: order.createdAt.toISOString(),
            })),
          },
          {
            route: '/produtos',
            data: products.map((product) => ({
              id: product.id,
              name: product.name,
              sku: product.sku,
              categoryName: product.category.name,
              costPrice: Number(product.costPrice),
              active: product.active,
              unit: product.unit,
            })),
          },
        ]
      : []),
    ...(!isCourier
      ? [
          {
            route: '/precos',
            data: {
              customers: customers.map((customer) => ({
                id: customer.id,
                name: customer.name,
                locationId: customer.locationId,
              })),
              products: products
                .filter((product) => product.active)
                .map((product) => ({
                  id: product.id,
                  name: product.name,
                  sku: product.sku,
                  categoryId: product.categoryId,
                  unit: product.unit,
                  purchaseUnit: product.purchaseUnit,
                  unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
                })),
              locations,
              basePrices: basePrices.map((price) => ({
                productId: price.productId,
                locationId: price.locationId,
                price: Number(price.price),
              })),
              quantityDiscounts: quantityDiscounts.map((discount) => ({
                categoryId: discount.categoryId,
                productId: discount.productId,
                baseUnit: discount.baseUnit,
                unit: discount.unit,
                minQuantity: discount.minQuantity,
                maxQuantity: discount.maxQuantity,
                discountPercent: Number(discount.discountPercent),
              })),
              sellerProfile: sellerProfile?.active
                ? {
                    defaultMarginPercent: Number(sellerProfile.defaultMarginPercent),
                    minMarginPercent: Number(sellerProfile.minMarginPercent),
                    maxMarginPercent: Number(sellerProfile.maxMarginPercent),
                    allowOrderMarginChange: sellerProfile.allowOrderMarginChange,
                  }
                : null,
            },
          },
        ]
      : []),
    ...(sellerProfile?.active
      ? [
          {
            route: '/pedidos/novo',
            data: {
              customers: customers.map((customer) => ({
                id: customer.id,
                name: customer.name,
                locationId: customer.locationId,
              })),
              products: products
                .filter((product) => product.active)
                .map((product) => ({
                  id: product.id,
                  name: product.name,
                  sku: product.sku,
                  categoryId: product.categoryId,
                  active: product.active,
                  unit: product.unit,
                  purchaseUnit: product.purchaseUnit,
                  unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
                })),
              basePrices: basePrices.map((price) => ({
                productId: price.productId,
                locationId: price.locationId,
                price: Number(price.price),
              })),
              quantityDiscounts: quantityDiscounts.map((discount) => ({
                categoryId: discount.categoryId,
                productId: discount.productId,
                baseUnit: discount.baseUnit,
                unit: discount.unit,
                minQuantity: discount.minQuantity,
                maxQuantity: discount.maxQuantity,
                discountPercent: Number(discount.discountPercent),
              })),
              sellerProfile: {
                defaultMarginPercent: Number(sellerProfile.defaultMarginPercent),
                minMarginPercent: Number(sellerProfile.minMarginPercent),
                maxMarginPercent: Number(sellerProfile.maxMarginPercent),
                allowOrderMarginChange: sellerProfile.allowOrderMarginChange,
              },
            },
          },
        ]
      : []),
    ...(isCourier
      ? [
          {
            route: '/entregas/minhas',
            data: deliveries.map((delivery) => ({
              id: delivery.id,
              orderId: delivery.order.id,
              status: delivery.status,
              customerName: delivery.order.customer.name,
              address: delivery.order.customer.address,
              phone: delivery.order.customer.phone,
              notes: delivery.order.notes,
              total: Number(delivery.order.total),
              items: delivery.order.items.map((item) => ({
                productName: item.product.name,
                quantity: item.enteredQuantity ?? item.quantity,
                unit: item.enteredUnit ?? item.product.unit,
              })),
            })),
          },
        ]
      : []),
  ]

  return { success: true as const, userId, role, snapshots }
}
