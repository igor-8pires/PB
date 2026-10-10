// src/app/produtos/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleProductActiveAction } from "./actions";
import { OfflineSnapshotWriter } from "@/components/offline-session";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ENTREGADOR") redirect("/entregas");

  const isAdmin = session.user.role === "ADMIN";
  const { q } = await searchParams;

  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { name: "asc" },
  });
  const numericSku = Number(q);
  const visibleProducts = q
    ? products.filter(
        (product) =>
          product.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()) ||
          (Number.isInteger(numericSku) && product.sku === numericSku),
      )
    : products;

  return (
    <main className="p-8">
      <OfflineSnapshotWriter
        userId={session.user.id}
        role={session.user.role}
        route="/produtos"
        data={products.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          categoryName: product.category.name,
          costPrice: Number(product.costPrice),
          active: product.active,
          unit: product.unit,
        }))}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Produtos</h1>
        {isAdmin && (
          <Link
            href="/produtos/novo"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Novo produto
          </Link>
        )}
      </div>

      <form className="mt-4">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou SKU..."
          className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
        />
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Custo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
            {visibleProducts.map((product) => (
              <tr key={product.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p>{product.name}</p>
                  <p className="text-xs text-gray-500">Unidade: {product.unit ?? "UN"}</p>
                </td>
                <td className="px-4 py-3 text-gray-500">{product.sku}</td>
                <td className="px-4 py-3">{product.category.name}</td>
                <td className="px-4 py-3">
                  {product.costPrice.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      product.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {product.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/produtos/${product.id}/editar`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Editar
                      </Link>
                      <form
                        action={async () => {
                          "use server";
                          const result = await toggleProductActiveAction(product.id);
                          if (result?.error === "Não autorizado.") {
                            redirect("/login?callbackUrl=%2Fprodutos");
                          }
                        }}
                      >
                        <button className="text-xs text-gray-600 hover:underline">
                          {product.active ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
