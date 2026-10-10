// src/app/pedidos/novo/new-order-form.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateItemPriceAction,
  calculateOrderItemsPriceAction,
  createOrderAction,
} from "./actions";
import { getLoginUrl } from "@/lib/client-auth";
import {
  createOfflineSyncId,
  saveOfflineDraftOrder,
} from "@/modules/offline-sync-manager";

type Option = { id: string; name: string };
type ProductOption = Option & {
  unit?: string;
  purchaseUnit?: string | null;
  unitsPerPurchaseUnit?: number | null;
};

type SellerProfileInfo = {
  defaultMarginPercent: number;
  minMarginPercent: number;
  maxMarginPercent: number;
  allowOrderMarginChange: boolean;
};

type CartItem = {
  productId: string;
  productName: string;
  quantity: number;
  stockQuantity: number;
  enteredUnit: string;
  marginPercent: number;
  basePrice: number;
  discountPercent: number;
  unitPrice: number;
  total: number;
  standardPrice: number;
  priceWasEdited: boolean;
  stockOk: boolean;
  availableStock: number;
};

type OrderPriceInput = {
  productId: string;
  quantity: number;
  enteredUnit: string;
  marginPercent?: number;
  finalUnitPrice?: number;
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function NewOrderForm({
  customers,
  products,
  sellerProfile,
  sellerId,
}: {
  customers: Option[];
  products: ProductOption[];
  sellerProfile: SellerProfileInfo;
  sellerId: string;
}) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [enteredUnit, setEnteredUnit] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [finalUnitPrice, setFinalUnitPrice] = useState<number | "">("");
  const [autoUnitPrice, setAutoUnitPrice] = useState<number | "">("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingItem, setLoadingItem] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState(1);
  const [editingUnitPrice, setEditingUnitPrice] = useState<number | "">("");
  const [editingMarginPercent, setEditingMarginPercent] = useState<number | "">(
    "",
  );
  const [confirming, setConfirming] = useState(false);

  function goToLogin() {
    router.push(getLoginUrl());
  }

  function toOrderPriceInput(item: CartItem): OrderPriceInput {
    return {
      productId: item.productId,
      quantity: item.quantity,
      enteredUnit: item.enteredUnit,
      ...(item.priceWasEdited
        ? { finalUnitPrice: item.unitPrice }
        : { marginPercent: item.marginPercent }),
    };
  }

  async function repriceCart(priceItems: OrderPriceInput[]) {
    const result = await calculateOrderItemsPriceAction({
      customerId,
      items: priceItems,
    });

    if (result.error || !result.data) {
      return { error: result.error ?? "Erro ao recalcular os itens." };
    }

    return {
      data: result.data.map((data) => ({
        productId: data.productId,
        productName: data.productName,
        quantity: data.quantity,
        stockQuantity: data.stockQuantity,
        enteredUnit: data.enteredUnit,
        marginPercent: data.marginPercent,
        basePrice: data.basePrice,
        discountPercent: data.discountPercent,
        unitPrice: data.unitPrice,
        total: data.total,
        standardPrice: data.standardPrice,
        priceWasEdited: data.priceWasEdited,
        stockOk: data.stockOk,
        availableStock: data.availableStock,
      })),
    };
  }

  useEffect(() => {
    if (!customerId || !productId || quantity <= 0) {
      return;
    }

    let cancelled = false;

    calculateItemPriceAction({
      customerId,
      productId,
      quantity,
      enteredUnit,
      discountItems: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        enteredUnit: item.enteredUnit,
      })),
    })
      .then((result) => {
        if (cancelled || result.error || !result.data) return;
        setFinalUnitPrice(result.data.unitPrice);
        setAutoUnitPrice(result.data.unitPrice);
      })
      .catch(() => {
        if (!cancelled) {
          setFinalUnitPrice("");
          setAutoUnitPrice("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, productId, quantity, enteredUnit, items]);

  async function handleAddItem() {
    setError(null);

    if (!customerId || !productId || quantity <= 0) {
      setError("Selecione cliente, produto e uma quantidade válida.");
      return;
    }

    if (finalUnitPrice === "" || finalUnitPrice <= 0) {
      setError("Informe o preço final unitário antes de adicionar o item.");
      return;
    }

    const priceWasEdited =
      autoUnitPrice === "" ||
      Math.abs(Number(finalUnitPrice) - autoUnitPrice) > 0.005;
    const candidate: OrderPriceInput = {
      productId,
      quantity,
      enteredUnit,
      ...(priceWasEdited
        ? { finalUnitPrice: Number(finalUnitPrice) }
        : { marginPercent: sellerProfile.defaultMarginPercent }),
    };

    setLoadingItem(true);
    let result;
    try {
      result = await repriceCart([...items.map(toOrderPriceInput), candidate]);
    } catch {
      goToLogin();
      return;
    } finally {
      setLoadingItem(false);
    }

    if (result.error || !result.data) {
      if (result.error === "Não autorizado.") {
        goToLogin();
        return;
      }
      setError(result.error ?? "Erro ao calcular preço.");
      return;
    }

    const requestedStockByProduct = result.data.reduce((totals, item) => {
      totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.stockQuantity);
      return totals;
    }, new Map<string, number>());
    const insufficientStock = result.data.find(
      (item) =>
        !item.stockOk ||
        (requestedStockByProduct.get(item.productId) ?? 0) > item.availableStock,
    );
    if (insufficientStock) {
      setError(
        `Estoque insuficiente para ${insufficientStock.productName} (disponível: ${insufficientStock.availableStock}).`,
      );
      return;
    }

    setItems(result.data);

    setProductId("");
    setEnteredUnit("");
    setQuantity(1);
    setFinalUnitPrice("");
    setAutoUnitPrice("");
  }

  async function handleRemoveItem(index: number) {
    const remainingItems = items.filter((_, currentIndex) => currentIndex !== index);
    if (editingItemIndex === index) {
      setEditingItemIndex(null);
    }
    if (remainingItems.length === 0) {
      setItems([]);
      return;
    }

    setLoadingItem(true);
    try {
      const result = await repriceCart(remainingItems.map(toOrderPriceInput));
      if (result.error || !result.data) {
        setError(result.error ?? "Erro ao recalcular os itens.");
        return;
      }
      setItems(result.data);
    } catch {
      goToLogin();
    } finally {
      setLoadingItem(false);
    }
  }

  function handleStartEditing(index: number) {
    const item = items[index];
    setError(null);
    setEditingItemIndex(index);
    setEditingQuantity(item.quantity);
    setEditingUnitPrice(item.unitPrice);
    setEditingMarginPercent(item.marginPercent);
  }

  function handleCancelEditing() {
    setEditingItemIndex(null);
    setEditingUnitPrice("");
    setEditingMarginPercent("");
  }

  async function handleSaveItem(index: number) {
    setError(null);

    if (editingUnitPrice === "" || editingUnitPrice <= 0) {
      setError("Informe um preço final unitário maior que zero.");
      return;
    }

    if (editingMarginPercent === "" || !Number.isFinite(editingMarginPercent)) {
      setError("Informe uma margem válida para o item.");
      return;
    }

    if (editingQuantity <= 0 || !Number.isInteger(editingQuantity)) {
      setError("Informe uma quantidade inteira maior que zero.");
      return;
    }

    const item = items[index];
    const marginWasEdited = editingMarginPercent !== item.marginPercent;
    const priceItems = items.map((currentItem, currentIndex) =>
      currentIndex === index
        ? {
            productId: item.productId,
            quantity: editingQuantity,
            enteredUnit: item.enteredUnit,
            ...(marginWasEdited
              ? { marginPercent: editingMarginPercent }
              : { finalUnitPrice: editingUnitPrice }),
          }
        : toOrderPriceInput(currentItem),
    );
    setLoadingItem(true);
    let result;
    try {
      result = await repriceCart(priceItems);
    } catch {
      goToLogin();
      return;
    } finally {
      setLoadingItem(false);
    }

    if (result.error || !result.data) {
      if (result.error === "Não autorizado.") {
        goToLogin();
        return;
      }
      setError(result.error ?? "Erro ao recalcular preço.");
      return;
    }

    const requestedStockByProduct = result.data.reduce((totals, currentItem) => {
      totals.set(
        currentItem.productId,
        (totals.get(currentItem.productId) ?? 0) + currentItem.stockQuantity,
      );
      return totals;
    }, new Map<string, number>());
    const insufficientStock = result.data.find(
      (currentItem) =>
        !currentItem.stockOk ||
        (requestedStockByProduct.get(currentItem.productId) ?? 0) > currentItem.availableStock,
    );
    if (insufficientStock) {
      setError(
        `Estoque insuficiente para ${insufficientStock.productName} (disponível: ${insufficientStock.availableStock}).`,
      );
      return;
    }

    setItems(result.data);
    handleCancelEditing();
  }

  async function handleConfirm() {
    setError(null);

    if (!customerId || items.length === 0) {
      setError("Adicione ao menos um item antes de confirmar.");
      return;
    }

    if (!navigator.onLine) {
      try {
        await saveOfflineDraftOrder({
          customerId,
          sellerId,
          notes: deliveryNotes.trim(),
          total: items.reduce((sum, item) => sum + item.total, 0),
          items: items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            enteredUnit: item.enteredUnit,
            finalUnitPrice: item.unitPrice,
          })),
        });
        router.push("/pedidos");
      } catch {
        setError("Não foi possível salvar o pedido neste dispositivo.");
      }
      return;
    }

    setConfirming(true);
    const offlineSyncId = createOfflineSyncId();
    let result;
    try {
      result = await createOrderAction({
        customerId,
        offlineSyncId,
        notes: deliveryNotes.trim(),
        items: items.map(toOrderPriceInput),
      });
    } catch {
      try {
        await saveOfflineDraftOrder({
          customerId,
          sellerId,
          syncId: offlineSyncId,
          notes: deliveryNotes.trim(),
          total,
          items: items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            enteredUnit: item.enteredUnit,
            finalUnitPrice: item.unitPrice,
          })),
        });
        router.push("/pedidos");
      } catch {
        goToLogin();
      }
      return;
    } finally {
      setConfirming(false);
    }

    if (result.error) {
      if (result.error === "Não autorizado.") {
        goToLogin();
        return;
      }
      setError(result.error);
      return;
    }

    router.push("/pedidos");
    router.refresh();
  }

  const total = items.reduce((sum, item) => sum + item.total, 0);
  const selectedProduct = products.find((product) => product.id === productId);
  const showMarginColumn =
    editingItemIndex !== null || items.some((item) => item.priceWasEdited);

  return (
    <div className="mt-6 max-w-3xl space-y-6">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="rounded-lg border bg-white p-4">
        <label htmlFor="customer" className="text-sm font-medium">
          Cliente
        </label>
        <select
          id="customer"
          value={customerId}
          onChange={(e) => {
            setFinalUnitPrice("");
            setAutoUnitPrice("");
            setCustomerId(e.target.value);
          }}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Selecione um cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <label htmlFor="delivery-notes" className="text-sm font-medium">
          Observações para o entregador
        </label>
        <textarea
          id="delivery-notes"
          value={deliveryNotes}
          onChange={(event) => setDeliveryNotes(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Ex.: entregar pela entrada lateral, tocar a campainha, falar com o porteiro..."
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Essas instruções ficarão visíveis para o entregador, inclusive após sincronizar um pedido offline.
        </p>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-medium">Adicionar item</h2>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <label htmlFor="product" className="text-sm text-gray-500">
              Produto
            </label>
            <select
              id="product"
              value={productId}
              onChange={(e) => {
                setFinalUnitPrice("");
                setAutoUnitPrice("");
                setProductId(e.target.value);
                const selected = products.find(
                  (product) => product.id === e.target.value,
                );
                setEnteredUnit(selected?.unit ?? "UN");
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Selecione um produto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="quantity" className="text-sm text-gray-500">
              Quantidade
            </label>
            <input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => {
                setFinalUnitPrice("");
                setAutoUnitPrice("");
                setQuantity(Number(e.target.value));
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="entered-unit" className="text-sm text-gray-500">
              Unidade
            </label>
            <select
              id="entered-unit"
              value={enteredUnit}
              onChange={(e) => {
                setFinalUnitPrice("");
                setAutoUnitPrice("");
                setEnteredUnit(e.target.value);
              }}
              disabled={!productId}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-50"
            >
              {selectedProduct && (
                <>
                  <option value={selectedProduct.unit ?? "UN"}>
                    {selectedProduct.unit ?? "UN"}
                  </option>
                  {selectedProduct.purchaseUnit && (
                    <option value={selectedProduct.purchaseUnit}>
                      {selectedProduct.purchaseUnit}
                    </option>
                  )}
                </>
              )}
            </select>
          </div>

          <div>
            <label htmlFor="final-price" className="text-sm text-gray-500">
              Preço final (unitário)
            </label>
            <input
              id="final-price"
              type="number"
              step="0.01"
              min="0.01"
              value={finalUnitPrice}
              onChange={(e) =>
                setFinalUnitPrice(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <p className="mt-1 text-xs text-gray-400">
          O preço padrão considera a margem de {sellerProfile.defaultMarginPercent}%.
          Uma alteração pode reduzir a margem do vendedor.
        </p>

        <button
          onClick={handleAddItem}
          disabled={loadingItem}
          className="mt-3 rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loadingItem ? "Calculando..." : "Adicionar item"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Qtd</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                {showMarginColumn && (
                  <th className="px-4 py-3 font-medium">Margem</th>
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    {editingItemIndex === index ? (
                      <input
                        aria-label={`Quantidade de ${item.productName}`}
                        type="number"
                        min={1}
                        value={editingQuantity}
                        onChange={(e) =>
                          setEditingQuantity(Number(e.target.value))
                        }
                        className="w-20 rounded-md border px-2 py-1"
                      />
                    ) : (
                      item.quantity
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.enteredUnit}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                  <td className="px-4 py-3 text-right">
                    {editingItemIndex === index ? (
                      <input
                        aria-label={`Preço final de ${item.productName}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={editingUnitPrice}
                        onChange={(e) =>
                          setEditingUnitPrice(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                        className="w-28 rounded-md border px-2 py-1 text-right"
                      />
                    ) : (
                      <>
                        <span className="block font-semibold">{formatBRL(item.total)}</span>
                        <span className="block text-xs text-gray-500">
                          {formatBRL(item.unitPrice)} / {item.enteredUnit}
                        </span>
                      </>
                    )}
                  </td>
                  {showMarginColumn && (
                    <td className="px-4 py-3">
                      {editingItemIndex === index ? (
                        <input
                          aria-label={`Margem de ${item.productName}`}
                          type="number"
                          step="0.1"
                          min={sellerProfile.minMarginPercent}
                          max={sellerProfile.maxMarginPercent}
                          value={editingMarginPercent}
                          onChange={(e) =>
                            setEditingMarginPercent(
                              e.target.value === "" ? "" : Number(e.target.value),
                            )
                          }
                          className="w-20 rounded-md border px-2 py-1"
                        />
                      ) : item.priceWasEdited ? (
                        `${item.marginPercent}%`
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {editingItemIndex === index ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveItem(index)}
                          disabled={loadingItem}
                          className="text-xs text-green-700 hover:underline disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={handleCancelEditing}
                          className="text-xs text-gray-600 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStartEditing(index)}
                          className="text-xs text-blue-700 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="font-medium">Total do pedido</span>
            <span className="font-semibold">{formatBRL(total)}</span>
          </div>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={confirming || items.length === 0}
        className="w-full rounded-md bg-green-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {confirming ? "Confirmando..." : "Confirmar pedido"}
      </button>
    </div>
  );
}
