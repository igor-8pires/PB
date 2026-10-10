// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminDashboard } from "@/app/dashboard/admin-dashboard";
import { VendedorDashboard } from "@/app/dashboard/vendedor-dashboard";
import { EntregadorDashboard } from "./entregador-dashboard";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      {session.user.role === "ADMIN" && <AdminDashboard />}
      {session.user.role === "VENDEDOR" && <VendedorDashboard />}
      {session.user.role === "ENTREGADOR" && <EntregadorDashboard />}
    </main>
  );
}
