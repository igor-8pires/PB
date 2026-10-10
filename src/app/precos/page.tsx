import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import MargensEPrecosPage from './margins-page'
import {
  getLocations,
  getProducts,
  getBasePrices,
  getSellersWithProfiles,
  getQuantityDiscounts,
} from './pricing-queries'

// Desabilita cache estático para garantir dados sempre atualizados
export const dynamic = 'force-dynamic'

export default async function PrecosEMargensRoute() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  // Busca em paralelo todos os dados necessários no banco via Prisma
  const [locations, products, basePrices, sellers, quantityDiscounts] = await Promise.all([
    getLocations(),
    getProducts(),
    getBasePrices(),
    getSellersWithProfiles(),
    getQuantityDiscounts(),
  ])

  return (
    <MargensEPrecosPage
      locations={locations}
      products={products}
      basePrices={basePrices}
      sellers={sellers}
      quantityDiscounts={quantityDiscounts}
    />
  )
}
