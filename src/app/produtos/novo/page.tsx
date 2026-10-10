// src/app/produtos/novo/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "../product-form";

export default async function NovoProdutoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/produtos");

  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Novo produto</h1>
      <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </main>
  );
}
