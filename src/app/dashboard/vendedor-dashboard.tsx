// src/components/dashboard/vendedor-dashboard.tsx
import Link from "next/link";

const cards = [
  { title: "Novo pedido", href: "/pedidos/novo", description: "Iniciar uma nova venda" },
  { title: "Pedidos", href: "/pedidos", description: "Ver seus pedidos em andamento" },
  { title: "Novo cliente", href: "/clientes/novo", description: "Cadastrar um novo cliente" },
  { title: "Clientes", href: "/clientes", description: "Buscar e editar clientes" },
  { title: "Produtos", href: "/produtos", description: "Consultar produtos disponíveis" },
];

export function VendedorDashboard() {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#66851c]">Área comercial</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Vamos vender.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Encontre clientes, consulte o catálogo e transforme oportunidades em pedidos.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(23,35,61,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(23,35,61,0.12)]"
          >
            <h2 className="font-semibold tracking-tight">{card.title}</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
