// src/components/dashboard/admin-dashboard.tsx
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  MapPin,
  Package,
  ReceiptText,
  ShieldCheck,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";

const cards = [
  { title: "Vendas", href: "/pedidos", description: "Acompanhar pedidos em andamento" },
  { title: "Estoque", href: "/estoque", description: "Movimentações e níveis de estoque" },
  { title: "Produtos", href: "/produtos", description: "Cadastro de produtos e categorias" },
  { title: "Preços", href: "/precos", description: "Preços base por localidade" },
  { title: "Vendedores", href: "/usuarios", description: "Margens e perfis comerciais" },
  { title: "Entregas", href: "/entregas", description: "Status das entregas em curso" },
  { title: "Auditoria", href: "/auditoria", description: "Histórico de operações" },
  { title: "Localidades", href: "/localidades", description: "Gerenciar cidades e regiões de entrega"},
  { title: "Clientes", href: "/clientes", description: "Gerenciar clientes e contatos" },
];

const icons = [ReceiptText, Package, ClipboardList, WalletCards, Users, Truck, ShieldCheck, MapPin, Users];

export function AdminDashboard() {
  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#66851c]">Visão geral</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tudo sob controle.</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Acompanhe a operação e acesse cada frente do negócio em um só lugar.</p>
        </div>
        <BarChart3 className="hidden size-12 text-[#9fbd37] sm:block" />
      </div>
      
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = icons[index];
          return (
          <Link
            key={card.href}
            href={card.href}
            className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(23,35,61,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(23,35,61,0.12)]"
          >
            <div className="mb-8 flex items-start justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#eff8d5] text-[#66851c]"><Icon className="size-5" /></span>
              <ArrowUpRight className="size-5 text-slate-300 transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-[#66851c]" />
            </div>
            <h2 className="font-semibold tracking-tight">{card.title}</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{card.description}</p>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
