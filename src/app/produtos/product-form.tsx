// src/app/produtos/product-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createProductAction,
  updateProductAction,
  createCategoryAction,
} from "./actions";
import { getLoginUrl } from "@/lib/client-auth";

type Category = { id: string; name: string };

type ProductFormProps = {
  categories: Category[];
  product?: {
    id: string;
    name: string;
    sku: number;
    categoryId: string;
    costPrice: number;
    description: string | null;
    unit: string;
    purchaseUnit: string | null;
    unitsPerPurchaseUnit: number | null;
  };
};

export function ProductForm({ categories, product }: ProductFormProps) {
  const router = useRouter();
  const isEditing = Boolean(product);

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [costPrice, setCostPrice] = useState(product?.costPrice ?? 0);
  const [description, setDescription] = useState(product?.description ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "UN");
  const [purchaseUnit, setPurchaseUnit] = useState(product?.purchaseUnit ?? "");
  const [unitsPerPurchaseUnit, setUnitsPerPurchaseUnit] = useState<number | "">(
    product?.unitsPerPurchaseUnit ?? "",
  );

  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState(categories);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function goToLogin() {
    router.push(getLoginUrl());
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;

    let result;
    try {
      result = await createCategoryAction({ name: newCategoryName.trim() });
    } catch {
      goToLogin();
      return;
    }
    if (result.error || !result.category) {
      if (result.error === "Não autorizado.") {
        goToLogin();
        return;
      }
      setError(result.error ?? "Erro ao criar categoria.");
      return;
    }

    setCategoryOptions((prev) => [...prev, result.category]);
    setCategoryId(result.category.id);
    setNewCategoryName("");
    setShowNewCategory(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !categoryId) {
      setError("Preencha nome e categoria.");
      return;
    }

    if (!unit.trim()) {
      setError("Informe a unidade base do produto.");
      return;
    }

    if (
      purchaseUnit.trim() &&
      (!unitsPerPurchaseUnit || !Number.isInteger(unitsPerPurchaseUnit) ||
        purchaseUnit.trim().toLocaleLowerCase() === unit.trim().toLocaleLowerCase())
    ) {
      setError("Informe uma unidade de compra diferente e um fator inteiro positivo.");
      return;
    }

    setSaving(true);
    const payload = {
      name,
      ...(isEditing && product ? { sku: Number(product.sku) } : {}),
      categoryId,
      costPrice,
      description,
      unit: unit.trim(),
      purchaseUnit: purchaseUnit.trim() || null,
      unitsPerPurchaseUnit: purchaseUnit.trim()
        ? Number(unitsPerPurchaseUnit)
        : null,
    };

    let result;
    try {
      result = isEditing
        ? await updateProductAction(product!.id, payload)
        : await createProductAction(payload);
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

    router.push("/produtos");
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

      {isEditing && (
        <div>
          <label className="text-sm font-medium">SKU</label>
          <input
            type="text"
            value={product?.sku ?? ""}
            readOnly
            className="mt-1 w-full rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Categoria</label>
        <div className="mt-1 flex gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Selecione uma categoria</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewCategory((v) => !v)}
            className="whitespace-nowrap rounded-md border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            + Nova
          </button>
        </div>

        {showNewCategory && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              placeholder="Nome da nova categoria"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              className="whitespace-nowrap rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
            >
              Criar
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Unidade base (estoque e venda)</label>
        <input
          type="text"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="UN, KG, L..."
          maxLength={12}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Unidade de compra (opcional)</label>
          <input
            type="text"
            value={purchaseUnit}
            onChange={(e) => setPurchaseUnit(e.target.value)}
            placeholder="CAIXA, FARDO..."
            maxLength={12}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Unidades base por unidade de compra</label>
          <input
            type="number"
            min="1"
            step="1"
            value={unitsPerPurchaseUnit}
            disabled={!purchaseUnit.trim()}
            onChange={(e) =>
              setUnitsPerPurchaseUnit(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Custo (R$)</label>
        <input
          type="number"
          step="0.01"
          min={0}
          value={costPrice}
          onChange={(e) => setCostPrice(Number(e.target.value))}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Descrição (opcional)</label>
        <textarea
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-md bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar produto"}
      </button>
    </form>
  );
}
