import type { Metadata } from "next";
import "./globals.css";
// src/app/layout.tsx
import { AuthProvider } from "./providers";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { LogoutButton } from "@/components/ui/logout-button";
import { OfflineUserSession } from "@/components/offline-session";
import { OfflineSnapshotSync } from "@/components/offline-snapshot-sync";
import { SyncStatusBar } from "@/components/sync-status-bar";
import { SWRegister } from "@/components/sw-register";
import { ArrowUpRight, Boxes } from "lucide-react";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <SWRegister />
          {session?.user && (
            <OfflineUserSession userId={session.user.id} role={session.user.role} />
          )}
          {session?.user && (
            <OfflineSnapshotSync userId={session.user.id} role={session.user.role} />
          )}
          {session?.user && (
            <header className="border-b border-white/10 bg-[#17233d] px-5 py-4 text-white shadow-lg shadow-slate-900/10 sm:px-8">
              <div className="mx-auto flex max-w-7xl items-center justify-between">
              <Link href="/dashboard" className="group flex items-center gap-3 text-sm font-semibold tracking-tight">
                <span className="flex size-9 items-center justify-center rounded-xl bg-[#c6f247] text-[#17233d] shadow-[4px_4px_0_#809d26] transition-transform group-hover:-translate-y-0.5">
                  <Boxes className="size-5" />
                </span>
                <span>Vendas<span className="text-[#c6f247]">+</span></span>
                <ArrowUpRight className="size-4 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-white/55">{session.user.role}</p>
                </div>
                <LogoutButton userId={session.user.id} />
              </div>
              </div>
            </header>
          )}
          {session?.user && <SyncStatusBar />}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  title: "Pires Bebidas",
  description: "Gestao de vendas, estoque, clientes e entregas.",
  manifest: "/manifest.json",
};
