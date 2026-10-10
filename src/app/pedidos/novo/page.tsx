// src/app/pedidos/novo/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OfflineSnapshotWriter } from "@/components/offline-session";
import { NewOrderForm } from "./new-order-form";

export default async function NovoPedidoPage() {
  const session = await auth();

  if (!session?.user) redirect("/login");
  if (session.user.role == "ENTREGADOR") redirect("/dashboard");

  const sellerProfile = await prisma.sellerProfile.findUnique({
    where: { sellerId: session.user.id },
  });

  if (!sellerProfile || !sellerProfile.active) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Novo pedido</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Seu perfil comercial ainda não foi configurado. Configure-o em
          Preços e Margens antes de criar pedidos.
        </p>
      </main>
    );
  }

  const [customers, products, basePrices, quantityDiscounts] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, locationId: true },
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        active: true,
        categoryId: true,
        unit: true,
        purchaseUnit: true,
        unitsPerPurchaseUnit: true,
      },
    }),
    prisma.basePrice.findMany({
      where: { active: true },
      select: { productId: true, locationId: true, price: true },
    }),
    prisma.quantityDiscount.findMany({
      where: { sellerId: session.user.id, active: true },
      select: {
        categoryId: true,
        productId: true,
        baseUnit: true,
        unit: true,
        minQuantity: true,
        maxQuantity: true,
        discountPercent: true,
      },
    }),
  ]);

  return (
    <main className="p-8">
      <OfflineSnapshotWriter
        userId={session.user.id}
        role={session.user.role}
        route="/pedidos/novo"
        data={{
          customers,
          products,
          basePrices: basePrices.map((basePrice) => ({
            ...basePrice,
            price: Number(basePrice.price),
          })),
          quantityDiscounts: quantityDiscounts.map((discount) => ({
            ...discount,
            discountPercent: Number(discount.discountPercent),
          })),
          sellerProfile: {
            defaultMarginPercent: Number(sellerProfile.defaultMarginPercent),
            minMarginPercent: Number(sellerProfile.minMarginPercent),
            maxMarginPercent: Number(sellerProfile.maxMarginPercent),
            allowOrderMarginChange: sellerProfile.allowOrderMarginChange,
          },
        }}
      />
      <h1 className="text-2xl font-semibold">Novo pedido</h1>
      <NewOrderForm
        sellerId={session.user.id}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          purchaseUnit: p.purchaseUnit,
          unitsPerPurchaseUnit: p.unitsPerPurchaseUnit,
        }))}
        sellerProfile={{
          defaultMarginPercent: sellerProfile.defaultMarginPercent,
          minMarginPercent: sellerProfile.minMarginPercent,
          maxMarginPercent: sellerProfile.maxMarginPercent,
          allowOrderMarginChange: sellerProfile.allowOrderMarginChange,
        }}
      />
    </main>
  );
}
