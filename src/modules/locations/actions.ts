'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Schemas Zod de Validação
const createLocationSchema = z.object({
  name: z.string().min(2, 'O nome da localidade deve ter no mínimo 2 caracteres'),
  city: z.string().min(2, 'Informe a cidade'),
  state: z.string().length(2, 'O estado deve ter 2 letras (UF)'),
  zipCode: z.string().optional().nullable(),
})

const updateLocationSchema = createLocationSchema.extend({
  id: z.string().min(1, 'ID da localidade é obrigatório'),
  active: z.boolean(),
})

type CreateLocationInput = z.infer<typeof createLocationSchema>
type UpdateLocationInput = z.infer<typeof updateLocationSchema>

// Server Action: Criar Localidade
export async function createLocation(data: CreateLocationInput) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return { success: false, error: 'Acesso negado. Apenas ADMINs podem cadastrar localidades.' }
  }

  const parsed = createLocationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors }
  }

  try {
    const location = await prisma.location.create({
      data: {
        name: parsed.data.name,
        city: parsed.data.city,
        state: parsed.data.state.toUpperCase(),
        zipCode: parsed.data.zipCode || null,
        active: true,
      },
    })

    revalidatePath('/dashboard/localidades')
    return { success: true, data: location }
  } catch {
    return { success: false, error: 'Erro ao cadastrar localidade no banco de dados.' }
  }
}

// Server Action: Atualizar Localidade
export async function updateLocation(data: UpdateLocationInput) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return { success: false, error: 'Acesso negado.' }
  }

  const parsed = updateLocationSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors }
  }

  try {
    const location = await prisma.location.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        city: parsed.data.city,
        state: parsed.data.state.toUpperCase(),
        zipCode: parsed.data.zipCode || null,
        active: parsed.data.active,
      },
    })

    revalidatePath('/dashboard/localidades')
    return { success: true, data: location }
  } catch {
    return { success: false, error: 'Erro ao atualizar localidade.' }
  }
}

export async function getLocationsPageData() {
  const [locations, products, basePrices] = await Promise.all([
    prisma.location.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        zipCode: true,
        active: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, costPrice: true },
      orderBy: { name: 'asc' },
    }),
    prisma.basePrice.findMany({
      where: { active: true },
      include: {
        product: { select: { name: true, costPrice: true } },
        location: { select: { name: true, city: true, state: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    locations,
    products: products.map((product) => ({
      ...product,
      costPrice: Number(product.costPrice),
    })),
    basePrices: basePrices.map((basePrice) => ({
      id: basePrice.id,
      productName: basePrice.product.name,
      costPrice: Number(basePrice.product.costPrice),
      locationName: `${basePrice.location.name} (${basePrice.location.city}/${basePrice.location.state})`,
      price: Number(basePrice.price),
    })),
  }
}
