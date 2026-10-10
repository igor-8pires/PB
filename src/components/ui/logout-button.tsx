// src/components/logout-button.tsx
"use client";

import { signOut } from "next-auth/react";
import { clearOfflineSnapshots } from "@/components/offline-session";

export function LogoutButton({ userId }: { userId: string }) {
  return (
    <button
      onClick={async () => {
        await clearOfflineSnapshots(userId);
        await signOut({ callbackUrl: "/login" });
      }}
      className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-white/80 hover:border-[#c6f247] hover:bg-white/10 hover:text-white"
    >
      Sair
    </button>
  );
}
