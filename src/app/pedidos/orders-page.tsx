'use client'

import React, { useState, useEffect, useTransition, useCallback, useSyncExternalStore } from 'react'
import { db, calculateOfflinePrice } from '@/modules/local-storage-db'
import { createOrderAction } from '@/app/pedidos/novo/actions'
import { saveOfflineDraftOrder } from '@/modules/offline-sync-manager'

interface ProductOption {
  id: string
  name: string
  sku: string
  costPrice: number
}

interface LocationOption {
  id: string
  name: string
  city: string
  state: string
}

interface OrderCartItem {
  productId: string
  productName: string
  costPrice: number
  basePrice: number
  marginPercent: number
  volumeDiscountPercent: number
  unitPrice: number
  quantity: number
  total: number
}

const subscribeToOnlineStatus = (callback: () => void) => {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)

  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

const getOnlineStatus = () => navigator.onLine
const getServerOnlineStatus = () => true

export default function OrdersPage() {
  const isOnline = useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, getServerOnlineStatus)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [products, setProducts] = useState<ProductOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantityInput, setQuantityInput] = useState(1)
  const [marginInput, setMarginInput] = useState(15)

  const [cart, setCart] = useState<OrderCartItem[]>([])

  const loadInitialData = useCallback(async () => {
    try {
      const localProds = await db.products.toArray()
      const localLocs = await db.locations.toArray()

      setProducts(localProds.map((p) => ({ ...p, costPrice: Number(p.costPrice) })))
      setLocations(localLocs)
      setCustomers([
        { id: 'c1', name: 'Cliente Exemplo SP Ltda' },
        { id: 'c2', name: 'Comércio de Bebidas Silva' },
      ])
    } catch (err) {
      console.error('Erro ao carregar dados locais:', err)
    }
  }, [])

  useEffect(() => {
    // A leitura do armazenamento local atualiza o estado após a montagem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitialData()
  }, [loadInitialData])



  const handleAddToCart = async () => {
    if (!selectedProductId || !selectedLocationId || quantityInput <= 0) {
      setFeedback({ type: 'error', message: 'Selecione produto, localidade e quantidade válida.' })
      return
    }

    const prod = products.find((p) => p.id === selectedProductId)
    if (!prod) return

    const bpRecord = await db.basePrices
      .where({ productId: selectedProductId, locationId: selectedLocationId })
      .first()

    const basePrice = bpRecord ? Number(bpRecord.price) : prod.costPrice * 1.2

    const volRecord = await db.volumeDiscounts
      .where('productId')
      .equals(selectedProductId)
      .and((v) => quantityInput >= v.minQuantity)
      .first()

    const volDiscount = volRecord ? Number(volRecord.discountPercent) : 0

    const unitPrice = calculateOfflinePrice(basePrice, marginInput, volDiscount)
    const itemTotal = unitPrice * quantityInput

    const newItem: OrderCartItem = {
      productId: prod.id,
      productName: prod.name,
      costPrice: prod.costPrice,
      basePrice,
      marginPercent: marginInput,
      volumeDiscountPercent: volDiscount,
      unitPrice,
      quantity: quantityInput,
      total: itemTotal,
    }

    setCart([...cart, newItem])
    setSelectedProductId('')
    setQuantityInput(1)
    setFeedback(null)
  }

  const handleFinalizeOrder = () => {
    if (!selectedCustomerId || cart.length === 0) {
      setFeedback({ type: 'error', message: 'Selecione o cliente e adicione itens ao carrinho.' })
      return
    }

    const grandTotal = cart.reduce((acc, i) => acc + i.total, 0)

    startTransition(async () => {
      if (navigator.onLine) {
        const res = await createOrderAction({
          customerId: selectedCustomerId,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            finalUnitPrice: item.unitPrice,
          })),
        })
        if ('success' in res && res.success) {
          setFeedback({ type: 'success', message: `Pedido #${res.orderId} emitido com sucesso no servidor!` })
          setCart([])
        } else {
          setFeedback({
            type: 'error',
            message: ('error' in res && res.error) || 'Erro ao emitir pedido no servidor.',
          })
        }
      } else {
        await saveOfflineDraftOrder({
          customerId: selectedCustomerId,
          total: grandTotal,
          items: cart.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            finalUnitPrice: item.unitPrice,
          })),
        })

        setFeedback({
          type: 'success',
          message: 'Você está offline. O pedido foi salvo no dispositivo e será sincronizado ao reconectar.',
        })
        setCart([])
      }
    })
  }

  const cartTotal = cart.reduce((acc, i) => acc + i.total, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emissão de Pedidos de Venda</h1>
          <p className="text-sm text-gray-500">
            Monte orçamentos e pedidos com cálculo automático de margem e suporte offline.
          </p>
        </div>
        <div className="text-right">
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
              isOnline ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {isOnline ? '● Online (Servidor Ativo)' : '● Offline (Modo Local)'}
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-md text-sm border ${
            feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-lg border shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">1. Dados da Venda</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cliente</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Selecione um cliente...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Localidade de Destino</label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Selecione a localidade...</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.city}/{l.state})
                </option>
              ))}
            </select>
          </div>

          <hr className="my-2" />
          <h2 className="text-md font-semibold text-gray-800">2. Adicionar Produto</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Produto</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Selecione um produto...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (SKU: {p.sku})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Quantidade</label>
              <input
                type="number"
                min="1"
                value={quantityInput}
                onChange={(e) => setQuantityInput(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Margem Vendedor (%)</label>
              <input
                type="number"
                step="0.5"
                value={marginInput}
                onChange={(e) => setMarginInput(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleAddToCart}
            className="w-full py-2 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium text-sm rounded-md transition-colors"
          >
            + Adicionar ao Carrinho
          </button>
        </div>

        <div className="lg:col-span-2 bg-white p-5 rounded-lg border shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Carrinho do Pedido</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600 border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-700 font-semibold">
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3">Preço Base</th>
                    <th className="py-2.5 px-3">Margem</th>
                    <th className="py-2.5 px-3">Qtd</th>
                    <th className="py-2.5 px-3 text-right">Preço Un.</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Nenhum item adicionado ao carrinho.
                      </td>
                    </tr>
                  ) : (
                    cart.map((item, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-medium text-gray-900">{item.productName}</td>
                        <td className="py-2.5 px-3">R$ {item.basePrice.toFixed(2)}</td>
                        <td className="py-2.5 px-3">{item.marginPercent}%</td>
                        <td className="py-2.5 px-3">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-right">R$ {item.unitPrice.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-gray-900">
                          R$ {item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <div className="flex justify-between items-center text-lg font-bold text-gray-900">
              <span>Total do Pedido:</span>
              <span className="text-2xl text-blue-600">R$ {cartTotal.toFixed(2)}</span>
            </div>

            <button
              onClick={handleFinalizeOrder}
              disabled={isPending || cart.length === 0}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-md transition-colors shadow disabled:opacity-50"
            >
              {isPending
                ? 'Processando...'
                : isOnline
                ? 'Emitir Pedido no Servidor'
                : 'Salvar Pedido Offline (Dispositivo)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
