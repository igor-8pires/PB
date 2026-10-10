"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approvePaymentTermsAction,
  recordPaymentAction,
} from "./actions";

type PaymentEntry = {
  id: string;
  method: "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";
  amount: number;
  paidAt: Date | null;
  createdAt: Date;
  recordedBy: { name: string } | null;
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PaymentPanel({
  orderId,
  customerName,
  total,
  payments,
  isAdmin,
  canRecord,
  showHistory,
  termsApprovedAt,
  dueAt,
}: {
  orderId: string;
  customerName: string;
  total: number;
  payments: PaymentEntry[];
  isAdmin: boolean;
  canRecord: boolean;
  showHistory: boolean;
  termsApprovedAt: Date | null;
  dueAt: Date | null;
}) {
  const router = useRouter();
  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, Math.round((total - paidTotal) * 100) / 100);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [dueDate, setDueDate] = useState(dueAt?.toISOString().slice(0, 10) ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await recordPaymentAction({
      orderId,
      method: new FormData(event.currentTarget).get("method") as "DINHEIRO" | "PIX",
      amount: Number(amount.replace(",", ".")),
    });
    setBusy(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  async function submitTerms(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await approvePaymentTermsAction({ orderId, dueDate });
    setBusy(false);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  return (
    <section id="pagamentos" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-950">Pagamentos</h2>
        <p className="text-sm text-slate-600">
          Saldo: <strong className="text-slate-950">{formatBRL(balance)}</strong>
        </p>
      </div>

      {showHistory && payments.length > 0 ? (
        <ul aria-label="Histórico de pagamentos" className="mt-4 divide-y divide-slate-100">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap justify-between gap-x-6 gap-y-2 py-3 text-sm">
              <div className="space-y-1">
                <p className="font-medium text-slate-900">Cliente: {customerName}</p>
                <p className="text-slate-600">
                  Recebido em{" "}
                  <time dateTime={(payment.paidAt ?? payment.createdAt).toISOString()}>
                    {(payment.paidAt ?? payment.createdAt).toLocaleString("pt-BR")}
                  </time>
                </p>
                <p className="text-slate-600">
                  Forma: {payment.method === "DINHEIRO" ? "Dinheiro" : payment.method}
                  {" · "}Registrado por: {payment.recordedBy?.name ?? "Usuário não identificado"}
                </p>
              </div>
              <strong className="tabular-nums text-slate-950">{formatBRL(payment.amount)}</strong>
            </li>
          ))}
        </ul>
      ) : showHistory ? (
        <p className="mt-3 text-sm text-slate-500">Nenhum pagamento registrado.</p>
      ) : null}

      {termsApprovedAt && balance > 0 && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Prazo liberado pelo administrador{dueAt ? ` até ${dueAt.toLocaleDateString("pt-BR")}` : " até a próxima venda"}.
        </p>
      )}

      {canRecord && balance > 0 && (
        <form onSubmit={submitPayment} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Valor recebido
            <input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Forma de pagamento
            <select name="method" defaultValue="PIX" className="rounded-md border border-slate-300 px-3 py-2">
              <option value="PIX">PIX</option>
              <option value="DINHEIRO">Dinheiro</option>
            </select>
          </label>
          <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Registrar recebimento
          </button>
        </form>
      )}

      {isAdmin && balance > 0 && (
        <form onSubmit={submitTerms} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Vencimento autorizado pelo administrador
            <input type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2" />
            <span className="text-xs font-normal text-slate-500">Sem prazo extra, o saldo deve ser quitado antes da próxima venda.</span>
          </label>
          <button type="submit" disabled={busy} className="rounded-md border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50">
            {termsApprovedAt ? "Atualizar prazo" : "Liberar prazo"}
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}