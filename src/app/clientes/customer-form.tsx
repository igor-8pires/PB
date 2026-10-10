// src/app/clientes/customer-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAction, updateCustomerAction } from "./actions";
import { getLoginUrl } from "@/lib/client-auth";

type LocationOption = { id: string; label: string };

type CustomerFormProps = {
  locations: LocationOption[];
  customer?: {
    id: string;
    name: string;
    document: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    locationId: string;
    notes: string | null;
  };
};

export function CustomerForm({ locations, customer }: CustomerFormProps) {
  const router = useRouter();
  const isEditing = Boolean(customer);

  const [name, setName] = useState(customer?.name ?? "");
  const [document, setDocument] = useState(customer?.document ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [locationId, setLocationId] = useState(customer?.locationId ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function goToLogin() {
    router.push(getLoginUrl());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !locationId) {
      setError("Preencha nome e localidade.");
      return;
    }

    setSaving(true);
    const payload = { name, document, phone, email, address, locationId, notes };

    let result;
    try {
      result = isEditing
        ? await updateCustomerAction(customer!.id, payload)
        : await createCustomerAction(payload);
    } catch {
      goToLogin();
      return;
    } finally {
      setSaving(false);
    }

    if (result.error) {
      if (result.error === "Não autorizado.") {
        goToLogin();
        return;
      }
      setError(result.error);
      return;
    }

    router.push("/clientes");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-lg space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div>
        <label className="text-sm font-medium">Nome</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Documento (CPF/CNPJ)</label>
          <input
            type="text"
            value={document ?? ""}
            onChange={(e) => setDocument(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Telefone</label>
          <input
            type="text"
            value={phone ?? ""}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Email (opcional)</label>
        <input
          type="email"
          value={email ?? ""}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Endereço</label>
        <input
          type="text"
          value={address ?? ""}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Localidade</label>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Selecione uma localidade</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {locations.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            Nenhuma localidade cadastrada ainda — peça ao administrador pra
            criar uma antes de cadastrar clientes.
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Observações (opcional)</label>
        <textarea
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={saving || locations.length === 0}
        className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar cliente"}
      </button>
    </form>
  );
}
