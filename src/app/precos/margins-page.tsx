'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveQuantityDiscount, updateSellerProfile } from '@/modules/pricing/actions'
import {
  LocationOption,
  ProductOption,
  BasePriceDetail,
  SellerProfileDetail,
  QuantityDiscountDetail,
  calculateFinalPrice,
} from './pricing-queries'

interface MarginsPageProps {
  locations: LocationOption[]
  products: ProductOption[]
  basePrices: BasePriceDetail[]
  sellers: SellerProfileDetail[]
  quantityDiscounts: QuantityDiscountDetail[]
}

export default function MargensEPrecosPage({
  locations = [],
  products = [],
  basePrices = [],
  sellers = [],
  quantityDiscounts = [],
}: MarginsPageProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'vendedores' | 'descontos' | 'simulador'>('vendedores')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Estados para formulário de Vendedor
  const [selectedSellerId, setSelectedSellerId] = useState('')
  const [defaultMargin, setDefaultMargin] = useState('15')
  const [minMargin, setMinMargin] = useState('5')
  const [maxMargin, setMaxMargin] = useState('30')
  const [allowOrderChange, setAllowOrderChange] = useState(true)

  const [discountId, setDiscountId] = useState('')
  const [discountSellerId, setDiscountSellerId] = useState('')
  const [discountScope, setDiscountScope] = useState<'ALL' | 'CATEGORY' | 'PRODUCT'>('ALL')
  const [discountCategoryId, setDiscountCategoryId] = useState('')
  const [discountProductId, setDiscountProductId] = useState('')
  const [discountBaseUnit, setDiscountBaseUnit] = useState('')
  const [discountUnit, setDiscountUnit] = useState('')
  const [discountMinQuantity, setDiscountMinQuantity] = useState('10')
  const [discountMaxQuantity, setDiscountMaxQuantity] = useState('')
  const [discountPercent, setDiscountPercent] = useState<string>('5')
  const [discountActive, setDiscountActive] = useState(true)

  // Estados para o Simulador
  const [simProduct, setSimProduct] = useState('')
  const [simLocation, setSimLocation] = useState('')
  const [simSeller, setSimSeller] = useState('')

  const discountCategories = Array.from(
    new Map(products.map((product) => [product.categoryId, {
      id: product.categoryId,
      name: product.categoryName,
    }])).values(),
  )
  const discountBaseUnitOptions = Array.from(new Set(
    products
      .filter((product) => product.categoryId === discountCategoryId)
      .map((product) => product.unit),
  ))
  const selectedDiscountProduct = products.find((product) => product.id === discountProductId)
  const productsForDiscountUnit = discountScope === 'CATEGORY'
    ? products.filter((product) =>
        product.categoryId === discountCategoryId && product.unit === discountBaseUnit,
      )
    : selectedDiscountProduct
      ? [selectedDiscountProduct]
      : []
  const discountUnitOptions = Array.from(new Set(
    productsForDiscountUnit.flatMap((product) => [
      product.unit,
      ...(product.purchaseUnit && product.unitsPerPurchaseUnit && product.unitsPerPurchaseUnit > 0
        ? [product.purchaseUnit]
        : []),
    ]),
  ))

  // Atualizar campos ao selecionar um vendedor
  const handleSelectSeller = (sellerId: string) => {
    setSelectedSellerId(sellerId)
    const seller = sellers.find((s) => s.sellerId === sellerId)
    if (seller) {
      setDefaultMargin(seller.defaultMarginPercent.toString())
      setMinMargin(seller.minMarginPercent.toString())
      setMaxMargin(seller.maxMarginPercent.toString())
      setAllowOrderChange(seller.allowOrderMarginChange)
    }
  }

  // Submeter atualização de perfil de vendedor
  const handleSaveSellerProfile = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    if (!selectedSellerId) {
      setFeedback({ type: 'error', message: 'Selecione um vendedor.' })
      return
    }

    startTransition(async () => {
      const res = await updateSellerProfile({
        sellerId: selectedSellerId,
        defaultMarginPercent: parseFloat(defaultMargin) || 0,
        minMarginPercent: parseFloat(minMargin) || 0,
        maxMarginPercent: parseFloat(maxMargin) || 0,
        allowOrderMarginChange: allowOrderChange,
      })

      if (res.success) {
        setFeedback({ type: 'success', message: 'Margens do vendedor atualizadas com sucesso!' })
      } else {
        setFeedback({ type: 'error', message: res.error || 'Erro ao atualizar margens.' })
      }
    })
  }

  const resetDiscountForm = () => {
    setDiscountId('')
    setDiscountSellerId('')
    setDiscountScope('ALL')
    setDiscountCategoryId('')
    setDiscountProductId('')
    setDiscountBaseUnit('')
    setDiscountUnit('')
    setDiscountMinQuantity('10')
    setDiscountMaxQuantity('')
    setDiscountPercent('5')
    setDiscountActive(true)
  }

  const handleEditDiscount = (discount: QuantityDiscountDetail) => {
    setDiscountId(discount.id)
    setDiscountSellerId(discount.sellerId)
    setDiscountScope(discount.productId ? 'PRODUCT' : discount.categoryId ? 'CATEGORY' : 'ALL')
    setDiscountCategoryId(discount.categoryId ?? '')
    setDiscountProductId(discount.productId ?? '')
    setDiscountBaseUnit(discount.baseUnit ?? '')
    setDiscountUnit(discount.unit ?? '')
    setDiscountMinQuantity(String(discount.minQuantity))
    setDiscountMaxQuantity(discount.maxQuantity === null ? '' : String(discount.maxQuantity))
    setDiscountPercent(String(discount.discountPercent))
    setDiscountActive(discount.active)
    setFeedback(null)
  }

  const handleSaveDiscount = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    startTransition(async () => {
      const res = await saveQuantityDiscount({
        ...(discountId ? { id: discountId } : {}),
        sellerId: discountSellerId,
        categoryId: discountScope === 'CATEGORY' ? discountCategoryId : null,
        productId: discountScope === 'PRODUCT' ? discountProductId : null,
        baseUnit: discountScope === 'ALL' ? null : discountBaseUnit,
        unit: discountScope === 'ALL' ? null : discountUnit,
        minQuantity: Number(discountMinQuantity),
        maxQuantity: discountMaxQuantity ? Number(discountMaxQuantity) : null,
        discountPercent: Number(discountPercent),
        active: discountActive,
      })

      if (res.success) {
        setFeedback({ type: 'success', message: 'Desconto por volume salvo com sucesso.' })
        resetDiscountForm()
        router.refresh()
      } else {
        setFeedback({ type: 'error', message: 'error' in res ? res.error ?? 'Confira os dados informados.' : 'Confira os dados informados.' })
      }
    })
  }

  const handleToggleDiscount = (discount: QuantityDiscountDetail) => {
    startTransition(async () => {
      const res = await saveQuantityDiscount({
        id: discount.id,
        sellerId: discount.sellerId,
        categoryId: discount.categoryId,
        productId: discount.productId,
        baseUnit: discount.baseUnit,
        unit: discount.unit,
        minQuantity: discount.minQuantity,
        maxQuantity: discount.maxQuantity,
        discountPercent: discount.discountPercent,
        active: !discount.active,
      })

      setFeedback(res.success
        ? { type: 'success', message: `Faixa ${discount.active ? 'desativada' : 'ativada'}.` }
        : { type: 'error', message: 'error' in res ? res.error ?? 'Confira os dados da faixa.' : 'Confira os dados da faixa.' })
      if (res.success) router.refresh()
    })
  }

  // Cálculo da simulação de Preço Final
  const currentBasePrice = basePrices.find(
    (bp) => bp.productId === simProduct && bp.locationId === simLocation
  )
  const currentSeller = sellers.find((s) => s.sellerId === simSeller)
  const calculatedBasePrice = currentBasePrice ? currentBasePrice.price : 0
  const sellerMargin = currentSeller ? currentSeller.defaultMarginPercent : 0
  const calculatedFinalPrice = calculateFinalPrice(calculatedBasePrice, sellerMargin)

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-8 font-sans">
      <header className="border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Margens e Preços</h1>
        <p className="text-gray-600 mt-1">
          Configure as margens comerciais dos vendedores e consulte os preços base por localidade.
        </p>
      </header>

      {/* Navegação por Abas */}
      <div className="flex border-b border-gray-200 space-x-4">
        <button
          onClick={() => setActiveTab('vendedores')}
          className={`py-2 px-4 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'vendedores'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Margens por Vendedor
        </button>
        <button
          onClick={() => setActiveTab('descontos')}
          className={`py-2 px-4 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'descontos'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Descontos por Volume
        </button>
        <button
          onClick={() => setActiveTab('simulador')}
          className={`py-2 px-4 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'simulador'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Simulador de Preço Final
        </button>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-md text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* ABA 1: Margens por Vendedor */}
      {activeTab === 'vendedores' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário de Configuração */}
          <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">Definir Margem do Vendedor</h2>

            <form onSubmit={handleSaveSellerProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selecione o Vendedor
                </label>
                <select
                  value={selectedSellerId}
                  onChange={(e) => handleSelectSeller(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Escolha um Vendedor --</option>
                  {sellers.map((s) => (
                    <option key={s.sellerId} value={s.sellerId}>
                      {s.sellerName} ({s.sellerEmail})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Margem Padrão (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={defaultMargin}
                  onChange={(e) => setDefaultMargin(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Margem Mínima (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={minMargin}
                    onChange={(e) => setMinMargin(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Margem Máxima (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={maxMargin}
                    onChange={(e) => setMaxMargin(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="allowChange"
                  checked={allowOrderChange}
                  onChange={(e) => setAllowOrderChange(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="allowChange" className="text-sm text-gray-700">
                  Permitir alteração de margem no pedido
                </label>
              </div>

              <button
                type="submit"
                disabled={isPending || !selectedSellerId}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {isPending ? 'Salvando...' : 'Salvar Margens'}
              </button>
            </form>
          </div>

          {/* Tabela de Vendedores e Perfis */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">Perfis de Margem Atuais</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600 uppercase text-xs">
                    <th className="py-3 px-4">Vendedor</th>
                    <th className="py-3 px-4">Margem Padrão</th>
                    <th className="py-3 px-4">Faixa (Mín - Máx)</th>
                    <th className="py-3 px-4">Alterar no Pedido?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sellers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-gray-500">
                        Nenhum vendedor cadastrado.
                      </td>
                    </tr>
                  ) : (
                    sellers.map((s) => (
                      <tr key={s.sellerId} className="hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-900">
                          {s.sellerName}
                          <span className="block text-xs text-gray-500 font-normal">
                            {s.sellerEmail}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-blue-600">
                          {s.defaultMarginPercent}%
                        </td>
                        <td className="py-3 px-4 text-gray-700">
                          {s.minMarginPercent}% - {s.maxMarginPercent}%
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              s.allowOrderMarginChange
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {s.allowOrderMarginChange ? 'Sim' : 'Não'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'descontos' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-800">
                {discountId ? 'Editar faixa' : 'Nova faixa'}
              </h2>
              {discountId && (
                <button type="button" onClick={resetDiscountForm} className="text-sm text-blue-700 hover:underline">
                  Nova
                </button>
              )}
            </div>
            <form onSubmit={handleSaveDiscount} className="space-y-4">
              <div>
                <label htmlFor="discount-seller" className="mb-1 block text-sm font-medium text-gray-700">
                  Vendedor
                </label>
                <select
                  id="discount-seller"
                  value={discountSellerId}
                  onChange={(e) => setDiscountSellerId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecione um vendedor</option>
                  {sellers.map((seller) => (
                    <option key={seller.sellerId} value={seller.sellerId}>{seller.sellerName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="discount-scope" className="mb-1 block text-sm font-medium text-gray-700">
                  Aplicar a
                </label>
                <select
                  id="discount-scope"
                  value={discountScope}
                  onChange={(event) => {
                    setDiscountScope(event.target.value as 'ALL' | 'CATEGORY' | 'PRODUCT')
                    setDiscountCategoryId('')
                    setDiscountProductId('')
                    setDiscountBaseUnit('')
                    setDiscountUnit('')
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="ALL">Todos os produtos</option>
                  <option value="CATEGORY">Categoria</option>
                  <option value="PRODUCT">Produto</option>
                </select>
              </div>
              {discountScope === 'CATEGORY' && (
                <>
                  <div>
                    <label htmlFor="discount-category" className="mb-1 block text-sm font-medium text-gray-700">
                      Categoria
                    </label>
                    <select
                      id="discount-category"
                      value={discountCategoryId}
                      onChange={(event) => {
                        setDiscountCategoryId(event.target.value)
                        setDiscountBaseUnit('')
                        setDiscountUnit('')
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Selecione uma categoria</option>
                      {discountCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="discount-base-unit" className="mb-1 block text-sm font-medium text-gray-700">
                      Unidade-base dos produtos
                    </label>
                    <select
                      id="discount-base-unit"
                      value={discountBaseUnit}
                      onChange={(event) => {
                        setDiscountBaseUnit(event.target.value)
                        setDiscountUnit('')
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      required
                      disabled={!discountCategoryId}
                    >
                      <option value="">Selecione a unidade-base</option>
                      {discountBaseUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {discountScope === 'PRODUCT' && (
                <div>
                  <label htmlFor="discount-product" className="mb-1 block text-sm font-medium text-gray-700">
                    Produto
                  </label>
                  <select
                    id="discount-product"
                    value={discountProductId}
                    onChange={(event) => {
                      const product = products.find((item) => item.id === event.target.value)
                      setDiscountProductId(event.target.value)
                      setDiscountBaseUnit(product?.unit ?? '')
                      setDiscountUnit(product?.unit ?? '')
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Selecione um produto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.unit})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {discountScope !== 'ALL' && (
                <div>
                  <label htmlFor="discount-unit" className="mb-1 block text-sm font-medium text-gray-700">
                    Unidade da faixa
                  </label>
                  <select
                    id="discount-unit"
                    value={discountUnit}
                    onChange={(event) => setDiscountUnit(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                    disabled={discountScope === 'CATEGORY' ? !discountBaseUnit : !discountProductId}
                  >
                    <option value="">Selecione uma unidade</option>
                    {discountUnitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}{unit === discountBaseUnit ? ' (base)' : ' (compra)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="discount-min" className="mb-1 block text-sm font-medium text-gray-700">
                    Quantidade mínima {discountUnit ? `(${discountUnit})` : '(unidade-base do produto)'}
                  </label>
                  <input
                    id="discount-min"
                    type="number"
                    min="1"
                    step="1"
                    value={discountMinQuantity}
                    onChange={(e) => setDiscountMinQuantity(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="discount-max" className="mb-1 block text-sm font-medium text-gray-700">
                    Quantidade máxima {discountUnit ? `(${discountUnit})` : '(unidade-base do produto)'}
                  </label>
                  <input
                    id="discount-max"
                    type="number"
                    min={discountMinQuantity || '1'}
                    step="1"
                    value={discountMaxQuantity}
                    onChange={(e) => setDiscountMaxQuantity(e.target.value)}
                    placeholder="Sem limite"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {discountScope === 'CATEGORY'
                  ? 'A quantidade soma produtos da categoria com a mesma unidade-base e compatíveis com a unidade escolhida.'
                  : discountScope === 'PRODUCT'
                    ? 'A quantidade total do produto é convertida para a unidade escolhida antes de aplicar a faixa.'
                    : 'A faixa geral considera a quantidade de cada produto em sua unidade-base.'}
              </p>
              <div>
                <label htmlFor="discount-percent" className="mb-1 block text-sm font-medium text-gray-700">
                  Desconto (%)
                </label>
                <input
                  id="discount-percent"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={discountActive}
                  onChange={(e) => setDiscountActive(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                />
                Faixa ativa
              </label>
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Salvando...' : 'Salvar faixa'}
              </button>
            </form>
          </section>

          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-xl font-semibold text-gray-800">Faixas cadastradas</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-600">
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3">Aplicação</th>
                    <th className="px-4 py-3">Quantidade</th>
                    <th className="px-4 py-3">Desconto</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {quantityDiscounts.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-gray-500">Nenhuma faixa cadastrada.</td></tr>
                  ) : quantityDiscounts.map((discount) => (
                    <tr key={discount.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{discount.sellerName}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {discount.productName
                          ? `${discount.productName} (${discount.baseUnit})`
                          : discount.categoryName
                            ? `${discount.categoryName} (${discount.baseUnit})`
                            : 'Todos os produtos'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {discount.minQuantity} a {discount.maxQuantity ?? 'sem limite'} {discount.unit ?? 'unidade-base'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{discount.discountPercent}%</td>
                      <td className="px-4 py-3">
                        <span className={discount.active ? 'text-green-700' : 'text-gray-500'}>
                          {discount.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button type="button" onClick={() => handleEditDiscount(discount)} className="font-medium text-blue-700 hover:underline">
                            Editar
                          </button>
                          <button type="button" disabled={isPending} onClick={() => handleToggleDiscount(discount)} className="font-medium text-gray-700 hover:underline disabled:opacity-50">
                            {discount.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ABA 3: Simulador de Preço Final por Localidade */}
      {activeTab === 'simulador' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Simulador: Cálculo de Preço por Localidade e Vendedor
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                1. Produto
              </label>
              <select
                value={simProduct}
                onChange={(e) => setSimProduct(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Selecione o Produto --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Custo: R$ {p.costPrice.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                2. Localidade (Região)
              </label>
              <select
                value={simLocation}
                onChange={(e) => setSimLocation(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Selecione a Localidade --</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.city}/{l.state})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                3. Vendedor
              </label>
              <select
                value={simSeller}
                onChange={(e) => setSimSeller(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Selecione o Vendedor --</option>
                {sellers.map((s) => (
                  <option key={s.sellerId} value={s.sellerId}>
                    {s.sellerName} (Margem: {s.defaultMarginPercent}%)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resultado da Simulação */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
            <div>
              <span className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                Custo de Aquisição
              </span>
              <span className="text-lg font-bold text-gray-700">
                {currentBasePrice ? `R$ ${currentBasePrice.costPrice.toFixed(2)}` : 'R$ 0,00'}
              </span>
            </div>

            <div>
              <span className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                Preço Base (Localidade)
              </span>
              <span className="text-lg font-bold text-blue-700">
                {currentBasePrice ? `R$ ${currentBasePrice.price.toFixed(2)}` : 'Não Cadastrado'}
              </span>
            </div>

            <div>
              <span className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                Margem Vendedor
              </span>
              <span className="text-lg font-bold text-purple-700">
                {currentSeller ? `${sellerMargin}%` : '0%'}
              </span>
            </div>

            <div className="bg-blue-600 text-white rounded-lg p-3">
              <span className="block text-xs uppercase font-semibold text-blue-100 mb-1">
                Preço Final Sugerido
              </span>
              <span className="text-2xl font-extrabold">
                R$ {calculatedFinalPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
