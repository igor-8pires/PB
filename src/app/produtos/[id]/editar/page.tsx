// src/app/produtos/[id]/editar/page.tsx
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "../../product-form";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/produtos");

  const { id } = await params;

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!product) notFound();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Editar produto</h1>
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        product={{
          id: product.id,
          name: product.name,
          sku: product.sku,
          categoryId: product.categoryId,
          costPrice: product.costPrice,
          description: product.description,
          unit: product.unit,
          purchaseUnit: product.purchaseUnit,
          unitsPerPurchaseUnit: product.unitsPerPurchaseUnit,
        }}
      />
    </main>
  );
}
