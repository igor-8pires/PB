import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const shortcuts = [
  {
    title: "Minhas entregas",
    href: "/entregas/minhas",
    description: "Atualizar o andamento das entregas assumidas",
  },
  {
    title: "Entregas disponíveis",
    href: "/entregas/disponiveis",
    description: "Assumir pedidos que aguardam entregador",
  },
  {
    title: "Relação de itens",
    href: "/entregas/relacao",
    description: "Consultar a separação consolidada",
  },
  {
    title: "Histórico",
    href: "/entregas/historico",
    description: "Rever entregas encerradas",
  },
];

export function EntregadorDashboard() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-emerald-800">
            Painel do entregador
          </p>
          <h1 className="text-3xl font-semibold text-slate-950">Entregas</h1>
          <p className="mt-2 text-sm text-slate-600">
            Acesse suas entregas, a relação de itens e o histórico.
          </p>
        </div>
        <Link
          href="/entregas/minhas"
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 sm:self-auto"
        >
          Abrir minhas entregas
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </header>

      <nav aria-label="Navegação de entregas" className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.href}
            href={shortcut.href}
            className="group flex items-start justify-between gap-3 border-t border-slate-200 py-4 hover:border-emerald-700"
          >
            <span>
              <span className="block font-semibold text-slate-900">{shortcut.title}</span>
              <span className="mt-1 block text-sm text-slate-600">{shortcut.description}</span>
            </span>
            <ArrowUpRight className="mt-1 size-4 shrink-0 text-slate-400 group-hover:text-emerald-800" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
}