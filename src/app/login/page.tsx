"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Email ou senha inválidos.");
        return;
      }

      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
      let destination = "/";
      if (callbackUrl) {
        try {
          const url = new URL(callbackUrl, window.location.origin);
          if (url.origin === window.location.origin) {
            destination = `${url.pathname}${url.search}${url.hash}`;
          }
        } catch {
          destination = "/";
        }
      }
      router.push(destination);
      router.refresh();
    } catch {
      setError("Não foi possível concluir o login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute -left-24 -top-24 size-72 rounded-full bg-[#c6f247]/25 blur-3xl" />
      <div className="absolute -bottom-32 -right-20 size-96 rounded-full bg-[#17233d]/10 blur-3xl" />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md space-y-5 rounded-3xl border border-black/5 bg-white/90 p-7 shadow-[0_24px_70px_rgba(23,35,61,0.14)] backdrop-blur sm:p-9"
      >
        <div>
          <div className="mb-7 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#17233d] text-lg font-bold text-[#c6f247]">+</span>
            <span className="font-semibold tracking-tight">Vendas<span className="text-[#66851c]">+</span></span>
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[#66851c]">Bem-vindo de volta</p>
          <h1 className="text-3xl font-semibold tracking-tight">Entrar no sistema</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acesse com seu email e senha cadastrados.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border bg-[#fafbf5] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#c6f247]/40"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Senha
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border bg-[#fafbf5] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#c6f247]/40"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#17233d] py-3 text-sm font-semibold text-white shadow-[4px_4px_0_#c6f247] transition hover:-translate-y-0.5 hover:bg-[#223252] disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
