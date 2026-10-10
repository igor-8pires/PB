'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { createStockMovement, getInventoryPageData } from '@/modules/inventory/actions'
import { InventoryItem, StockMovementDetail, InventoryMetrics } from '@/modules/inventory/queries'

interface InventoryPageProps {
  initialSummary?: InventoryItem[]
  initialMovements?: StockMovementDetail[]
  initialMetrics?: InventoryMetrics
}

export default function GestaoEstoquePage({
  initialSummary = [],
  initialMovements = [],
  initialMetrics = {
    totalProducts: 0,
    totalItemsInStock: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalStockValue: 0,
  },
}: InventoryPageProps) {
  const [activeTab, setActiveTab] = useState<'posicao' | 'movimentar' | 'historico'>('posicao')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Estados locais para reatividade instantânea
  const [summaryList, setSummaryList] = useState<InventoryItem[]>(initialSummary)
  const [movementsList, setMovementsList] = useState<StockMovementDetail[]>(initialMovements)
  const [metrics, setMetrics] = useState<InventoryMetrics>(initialMetrics)

  useEffect(() => {
    let active = true

    getInventoryPageData().then((data) => {
      if (!active) return
      setSummaryList(data.summary)
      setMovementsList(data.movements)
      setMetrics(data.metrics)
    }).catch(() => {
      if (active) {
        setFeedback({ type: 'error', message: 'Erro ao carregar os produtos do estoque.' })
      }
    })

    return () => {
      active = false
    }
  }, [])

  // Filtros de busca
  const [searchQuery, setSearchQuery] = useState('')

  // Formulário de Nova Movimentação
  const [selectedProductId, setSelectedProductId] = useState('')
  const [enteredUnit, setEnteredUnit] = useState('')
  const [movementType, setMovementType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('IN')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [reason, setReason] = useState('')

  // Produto selecionado no formulário para mostrar estoque atual
  const selectedProductInfo = summaryList.find((p) => p.productId === selectedProductId)
  const movementUnit = enteredUnit || selectedProductInfo?.unit || 'UN'

  // Executar nova movimentação
  const handleCreateMovement = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    const qtyNumber = quantity.trim() === '' ? undefined : Number(quantity)
    const unitCostNumber = unitCost.trim() === '' ? undefined : Number(unitCost)
    if (!selectedProductId || !reason.trim() || (movementType !== 'ADJUSTMENT' && (qtyNumber === undefined || !Number.isFinite(qtyNumber) || qtyNumber <= 0))) {
      setFeedback({ type: 'error', message: 'Preencha todos os campos corretamente.' })
      return
    }

    if (movementType === 'ADJUSTMENT' && qtyNumber === undefined && unitCostNumber === undefined) {
      setFeedback({ type: 'error', message: 'Informe a quantidade, o custo ou ambos no ajuste.' })
      return
    }

    if (movementType === 'IN' && unitCostNumber !== undefined && (!Number.isFinite(unitCostNumber) || unitCostNumber < 0)) {
      setFeedback({ type: 'error', message: 'Informe um custo de lote válido.' })
      return
    }

    const baseQuantity = qtyNumber === undefined
      ? undefined
      : Math.round(qtyNumber * (movementUnit === selectedProductInfo?.purchaseUnit
        ? selectedProductInfo.unitsPerPurchaseUnit ?? 1
        : 1))
    if (movementType === 'OUT' && baseQuantity !== undefined && selectedProductInfo && selectedProductInfo.currentStock < baseQuantity) {
      setFeedback({
        type: 'error',
        message: `Estoque insuficiente! Saldo atual é de ${selectedProductInfo.currentStock} unidades.`,
      })
      return
    }

    startTransition(async () => {
      const res = await createStockMovement({
        productId: selectedProductId,
        type: movementType,
        enteredUnit: movementUnit,
        enteredQuantity: qtyNumber,
        unitCost: movementType === 'IN' || movementType === 'ADJUSTMENT' ? unitCostNumber : undefined,
        reason: reason.trim(),
      })

      if (res.success) {
        setFeedback({ type: 'success', message: 'Movimentação de estoque realizada com sucesso!' })

        const updatedData = await getInventoryPageData()
        setSummaryList(updatedData.summary)
        setMovementsList(updatedData.movements)
        setMetrics(updatedData.metrics)

        // Reset campos do formulário
        setSelectedProductId('')
        setEnteredUnit('')
        setQuantity('')
        setUnitCost('')
        setReason('')
      } else {
        setFeedback({ type: 'error', message: res.error || 'Erro ao registrar movimentação.' })
      }
    })
  }

  // Filtragem da tabela de posição de estoque
  const filteredSummary = summaryList.filter(
    (item) =>
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(item.sku).toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão e Controle de Estoque</h1>
          <p className="text-sm text-gray-500">
            Acompanhe o saldo dos produtos, registre movimentações e consulte o histórico de auditoria.
          </p>
        </div>

        {/* NAVEGAÇÃO ENTRE ABAS */}
        <div className="flex bg-gray-100 p-1 rounded-lg border">
          <button
            onClick={() => {
              setActiveTab('posicao')
              setFeedback(null)
            }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'posicao' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Posição do Estoque
          </button>
          <button
            onClick={() => {
              setActiveTab('movimentar')
              setFeedback(null)
            }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'movimentar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Nova Movimentação
          </button>
          <button
            onClick={() => {
              setActiveTab('historico')
              setFeedback(null)
            }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'historico' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Histórico & Auditoria
          </button>
        </div>
      </div>

      {/* CARDS DE MÉTRICAS EXECUTIVAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border shadow-sm space-y-1">
          <span className="text-xs font-semibold uppercase text-gray-500">Total de Produtos</span>
          <div className="text-2xl font-bold text-gray-900">{metrics.totalProducts}</div>
          <p className="text-xs text-gray-500">{metrics.totalItemsInStock} unidades no total</p>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm space-y-1">
          <span className="text-xs font-semibold uppercase text-gray-500">Valor em Custo</span>
          <div className="text-2xl font-bold text-blue-600">
            R$ {metrics.totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-gray-500">Avaliação do estoque a preço de custo</p>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm space-y-1">
          <span className="text-xs font-semibold uppercase text-amber-600">Estoque Baixo</span>
          <div className="text-2xl font-bold text-amber-600">{metrics.lowStockCount}</div>
          <p className="text-xs text-gray-500">Produtos com ≤ 10 unidades</p>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm space-y-1">
          <span className="text-xs font-semibold uppercase text-red-600">Esgotados</span>
          <div className="text-2xl font-bold text-red-600">{metrics.outOfStockCount}</div>
          <p className="text-xs text-gray-500">Produtos sem saldo para venda</p>
        </div>
      </div>

      {/* ALERTAS DE FEEDBACK */}
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

      {/* ABA 1: POSIÇÃO DE ESTOQUE */}
      {activeTab === 'posicao' && (
        <div className="bg-white p-5 rounded-lg border shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-800">Saldo Atual por Produto</h2>
            <input
              type="text"
              placeholder="Buscar por nome, SKU ou categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 border-collapse">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-700 font-semibold">
                  <th className="py-2.5 px-3 text-right">Quantidade</th>
                  <th className="py-2.5 px-3">Unidade</th>
                  <th className="py-2.5 px-3">Descrição</th>
                  <th className="py-2.5 px-3 text-right">Valor em Estoque</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Categoria</th>
                  <th className="py-2.5 px-3 text-right">Custo Unitário</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-400">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredSummary.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="py-2.5 px-3 text-right font-bold text-gray-900 tabular-nums">{item.currentStock}</td>
                      <td className="py-2.5 px-3 text-gray-600">{item.unit}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{item.productName}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-gray-700">
                        R$ {item.totalStockValue.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-gray-500">{item.sku}</td>
                      <td className="py-2.5 px-3 text-gray-500">{item.categoryName}</td>
                      <td className="py-2.5 px-3 text-right">R$ {item.costPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-center">
                        {item.status === 'IN_STOCK' && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 font-medium">
                            Em Estoque
                          </span>
                        )}
                        {item.status === 'LOW_STOCK' && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-medium">
                            Estoque Baixo
                          </span>
                        )}
                        {item.status === 'OUT_OF_STOCK' && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 font-medium">
                            Esgotado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 2: FORMULÁRIO DE NOVA MOVIMENTAÇÃO */}
      {activeTab === 'movimentar' && (
        <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg border shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Registrar Movimentação Manual</h2>
            <p className="text-xs text-gray-500">
              Faça entradas de mercadorias, saídas manuais ou ajustes de inventário.
            </p>
          </div>

          <form onSubmit={handleCreateMovement} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Tipo de Movimentação</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setMovementType('IN')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                    movementType === 'IN'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  ENTRADA (IN)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('OUT')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                    movementType === 'OUT'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  SAÍDA (OUT)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('ADJUSTMENT')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors ${
                    movementType === 'ADJUSTMENT'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  AJUSTE (+/-)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Produto</label>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value)
                  setEnteredUnit('')
                }}
                required
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Selecione o produto...</option>
                {summaryList.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productName} (SKU: {p.sku}) — Saldo Atual: {p.currentStock} un
                  </option>
                ))}
              </select>
            </div>

            {selectedProductInfo && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-md text-xs text-blue-900 flex justify-between">
                <span>
                  <strong>Produto:</strong> {selectedProductInfo.productName}
                </span>
                <span>
                  <strong>Saldo Disponível:</strong> {selectedProductInfo.currentStock} unidades
                </span>
              </div>
            )}

            {selectedProductInfo && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Unidade da quantidade
                </label>
                <select
                  aria-label="Unidade da quantidade"
                  value={movementUnit}
                  onChange={(e) => setEnteredUnit(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value={selectedProductInfo.unit}>
                    {selectedProductInfo.unit} (unidade base)
                  </option>
                  {selectedProductInfo.purchaseUnit &&
                    selectedProductInfo.purchaseUnit !== selectedProductInfo.unit &&
                    selectedProductInfo.unitsPerPurchaseUnit &&
                    selectedProductInfo.unitsPerPurchaseUnit > 0 && (
                      <option value={selectedProductInfo.purchaseUnit}>
                        {selectedProductInfo.purchaseUnit} ({selectedProductInfo.unitsPerPurchaseUnit} {selectedProductInfo.unit})
                      </option>
                    )}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Quantidade ({movementUnit})
              </label>
              <input
                type="number"
                min={movementType === 'ADJUSTMENT' ? undefined : '1'}
                placeholder={movementType === 'ADJUSTMENT' ? 'Ex: -2, 2 ou deixe vazio' : 'Ex: 50'}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {(movementType === 'IN' || movementType === 'ADJUSTMENT') && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Custo do lote por {selectedProductInfo?.unit ?? 'unidade'} (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 12,50"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {movementType === 'ADJUSTMENT'
                    ? 'Informe para substituir o custo atual do produto.'
                    : 'Informado em uma entrada, recalcula o custo médio do produto.'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Motivo / Justificativa / Documento
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Recebimento de NF 12345, Perda por avaria, Balanço físico..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-md transition-colors disabled:opacity-50"
            >
              {isPending ? 'Processando...' : 'Confirmar Movimentação'}
            </button>
          </form>
        </div>
      )}

      {/* ABA 3: HISTÓRICO DE MOVIMENTAÇÕES E AUDITORIA */}
      {activeTab === 'historico' && (
        <div className="bg-white p-5 rounded-lg border shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Histórico Completo de Movimentações</h2>
            <span className="text-xs text-gray-500">Últimas {movementsList.length} operações registradas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 border-collapse">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-700 font-semibold">
                  <th className="py-2.5 px-3 text-right">Quantidade</th>
                  <th className="py-2.5 px-3">Unidade</th>
                  <th className="py-2.5 px-3">Descrição</th>
                  <th className="py-2.5 px-3 text-right">Valor</th>
                  <th className="py-2.5 px-3">Data/Hora</th>
                  <th className="py-2.5 px-3 text-center">Tipo</th>
                  <th className="py-2.5 px-3">Motivo / Vínculo</th>
                  <th className="py-2.5 px-3">Usuário Responsável</th>
                </tr>
              </thead>
              <tbody>
                {movementsList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-400">
                      Nenhuma movimentação registrada no histórico.
                    </td>
                  </tr>
                ) : (
                  movementsList.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-gray-50">
                      <td className="py-2.5 px-3 text-right font-bold text-gray-900 tabular-nums">
                        {(() => {
                          const quantity = m.enteredQuantity ?? m.quantity
                          const signedQuantity = m.type === 'OUT' ? -Math.abs(quantity) : quantity
                          return signedQuantity > 0 ? `+${signedQuantity}` : signedQuantity
                        })()}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">{m.enteredUnit ?? m.unit}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        {m.productName} <span className="text-xs text-gray-400">({m.sku})</span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {m.unitCost === null
                          ? '—'
                          : `R$ ${(Math.abs(m.quantity) * m.unitCost).toFixed(2)}`}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-500">
                        {new Date(m.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {m.type === 'IN' && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded bg-green-100 text-green-800 font-bold">
                            ENTRADA
                          </span>
                        )}
                        {m.type === 'OUT' && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded bg-red-100 text-red-800 font-bold">
                            SAÍDA
                          </span>
                        )}
                        {m.type === 'ADJUSTMENT' && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800 font-bold">
                            AJUSTE
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">
                        {m.reason}
                        {m.orderId && (
                          <span className="block text-blue-600 font-mono text-[11px]">
                            Pedido #{m.orderId}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-500">{m.userName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
