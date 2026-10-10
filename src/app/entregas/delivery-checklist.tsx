"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordDeliveryItemOccurrenceAction,
  updateDeliveryItemCheckAction,
} from "./actions";

type ChecklistDelivery = {
  id: string;
  orderId: string;
  customerName: string;
  address: string | null;
  notes: string | null;
  occurrences: { id: string; description: string | null; createdAt: Date }[];
  items: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    purchaseUnit: string | null;
    unitsPerPurchaseUnit: number | null;
    checked: boolean;
  }[];
};

type ChecklistItem = {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  purchaseUnit: string | null;
  unitsPerPurchaseUnit: number | null;
  checked: boolean;
  sources: { deliveryId: string; orderItemId: string; checked: boolean }[];
};

function formatQuantity(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatDate(value: Date) {
  return new Date(value).toLocaleString("pt-BR");
}

export function DeliveryChecklist({ deliveries }: { deliveries: ChecklistDelivery[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const itemTotals = new Map<
    string,
    Omit<ChecklistItem, "checked"> & { allChecked: boolean }
  >();
  for (const delivery of deliveries) {
    for (const item of delivery.items) {
      const conversion = item.unitsPerPurchaseUnit;
      const key = item.productId;
      const current = itemTotals.get(key) ?? {
        id: key,
        productName: item.productName,
        quantity: 0,
        unit: item.unit,
        purchaseUnit: item.purchaseUnit,
        unitsPerPurchaseUnit: conversion,
        allChecked: true,
        sources: [],
      };
      current.quantity += item.quantity;
      current.allChecked &&= item.checked;
      current.sources.push({
        deliveryId: delivery.id,
        orderItemId: item.id,
        checked: item.checked,
      });
      itemTotals.set(key, current);
    }
  }
  const items: ChecklistItem[] = [...itemTotals.values()]
    .map(({ allChecked, ...item }) => ({ ...item, checked: allChecked }))
    .sort((left, right) => left.productName.localeCompare(right.productName));

  function formatItemQuantity(item: ChecklistItem) {
    const conversion = item.unitsPerPurchaseUnit;
    if (!item.purchaseUnit || !conversion || conversion <= 1) {
      return `${formatQuantity(item.quantity)} ${item.unit}`;
    }

    const groupedQuantity = Math.floor(item.quantity / conversion);
    const baseRemainder = item.quantity % conversion;
    return [
      groupedQuantity > 0 ? `${groupedQuantity} ${item.purchaseUnit}` : null,
      baseRemainder > 0 ? `${formatQuantity(baseRemainder)} ${item.unit}` : null,
    ]
      .filter(Boolean)
      .join(" + ");
  }

  function updateCheck(item: ChecklistItem, checked: boolean) {
    setFeedback((current) => ({ ...current, [item.id]: "" }));
    startTransition(async () => {
      const results = await Promise.all(
        item.sources
          .filter((source) => source.checked !== checked)
          .map((source) =>
            updateDeliveryItemCheckAction(source.deliveryId, source.orderItemId, checked),
          ),
      );
      const error = results.find((result) => result?.error)?.error;
      if (error) {
        setFeedback((current) => ({ ...current, [item.id]: error }));
      } else {
        router.refresh();
      }
    });
  }

  function recordOccurrence(item: ChecklistItem) {
    setFeedback((current) => ({ ...current, [item.id]: "" }));
    startTransition(async () => {
      const source = item.sources[0];
      if (!source) return;

      const result = await recordDeliveryItemOccurrenceAction({
        deliveryId: source.deliveryId,
        orderItemId: source.orderItemId,
        missing: !item.checked,
        note: notes[item.id] ?? "",
      });
      if (result?.error) {
        setFeedback((current) => ({ ...current, [item.id]: result.error! }));
      } else {
        setNotes((current) => ({ ...current, [item.id]: "" }));
        setFeedback((current) => ({ ...current, [item.id]: "Observação registrada." }));
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Conferência dos itens</h2>
        <p className="mt-1 text-sm text-slate-600">
          Marque cada item conferido ou registre uma falta/ocorrência.
        </p>
      </div>

      {deliveries.some((delivery) => delivery.notes) && (
        <div className="space-y-2">
          {deliveries.filter((delivery) => delivery.notes).map((delivery) => (
            <div key={delivery.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">{delivery.customerName} — instruções de entrega</p>
              <p className="mt-1 whitespace-pre-wrap">{delivery.notes}</p>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="border-y border-slate-200 py-4 text-sm text-slate-500">
          Os pedidos atribuídos não possuem itens.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "66.666%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "14.334%" }} />
            </colgroup>
            <thead className="border-y border-slate-200 text-left text-slate-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Check</th>
                <th className="px-2 py-2 font-medium">Descrição</th>
                <th className="px-2 py-2 text-right font-medium">Qtd.</th>
                <th className="py-2 pl-2 font-medium">Ocorrência</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-2 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Conferido: ${item.productName}`}
                      checked={item.checked}
                      disabled={isPending}
                      onChange={(event) => updateCheck(item, event.target.checked)}
                      className="mt-1 size-4 accent-emerald-700"
                    />
                  </td>
                  <th scope="row" className="break-words px-2 py-3 text-left font-medium text-slate-900">
                    {item.productName}
                  </th>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-700">
                    {formatItemQuantity(item)}
                  </td>
                  <td className="py-2 pl-2 align-top">
                    <textarea
                      aria-label={`Observação: ${item.productName}`}
                      rows={2}
                      maxLength={1000}
                      value={notes[item.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      placeholder="Falta ou ocorrência"
                      className="w-full resize-y rounded-sm border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      disabled={isPending || (item.checked && !(notes[item.id] ?? "").trim())}
                      onClick={() => recordOccurrence(item)}
                      className="mt-1 text-xs font-semibold text-emerald-800 hover:underline disabled:opacity-50"
                    >
                      Registrar
                    </button>
                    {feedback[item.id] && (
                      <p role="status" className="mt-1 text-xs text-slate-600">
                        {feedback[item.id]}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deliveries.some((delivery) => delivery.occurrences.length > 0) && (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-2">
          <h3 className="text-xs font-semibold text-amber-950">Observações registradas</h3>
          <ul className="mt-1 space-y-1 text-xs text-amber-900">
            {deliveries.flatMap((delivery) =>
              delivery.occurrences.map((occurrence) => (
                <li key={occurrence.id}>
                  {delivery.customerName}: {occurrence.description}{" "}
                  <span className="text-amber-700">· {formatDate(occurrence.createdAt)}</span>
                </li>
              )),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}