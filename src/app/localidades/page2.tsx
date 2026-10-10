'use client'

import React, { useState, useTransition } from 'react'
import { createLocation } from '@/modules/locations/actions'
import { setBasePrice } from '@/modules/pricing/actions'

// Tipos auxiliares para a interface
interface LocationItem {
  id: string
  name: string
  city: string
  state: string
  zipCode?: string | null
  active: boolean
}

interface BasePriceItem {
  id: string
  productName: string
  costPrice: number
  locationName: string
  price: number
}

interface LocationsPageProps {
  initialLocations?: LocationItem[]
  initialBasePrices?: BasePriceItem[]
  productsList?: { id: string; name: string; costPrice: number }[]
}

export default function LocalidadesECustosPage({
  initialLocations = [],
  initialBasePrices = [],
  productsList = [],
}: LocationsPageProps) {
  const [activeTab, setActiveTab] = useState<'localidades' | 'precos'>('localidades')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Estados do formulário de Localidade
  const [locName, setLocName] = useState('')
  const [locCity, setLocCity] = useState('')
  const [locState, setLocState] = useState('')
  const [locZipCode, setLocZipCode] = useState('')

  // Estados do formulário de Preço Base / Custo
  const [selectedProduct, setSelectedProduct] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [basePriceValue, setBasePriceValue] = useState('')

  // Submeter formulário de Localidade
  const handleCreateLocation = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    startTransition(async () => {
      const res = await createLocation({
        name: locName,
        city: locCity,
        state: locState,
        zipCode: locZipCode || null,
      })

      if (res.success) {
        setFeedback({ type: 'success', message: 'Localidade cadastrada com sucesso!' })
        setLocName('')
        setLocCity('')
        setLocState('')
        setLocZipCode('')
      } else {
        setFeedback({ type: 'error', message: res.error || 'Erro ao cadastrar localidade.' })
      }
    })
  }

  // Submeter formulário de Preço Base por Localidade
  const handleSetBasePrice = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    if (!selectedProduct || !selectedLocation || !basePriceValue) {
      setFeedback({ type: 'error', message: 'Preencha todos os campos do preço base.' })
      return
    }

    startTransition(async () => {
      const res = await setBasePrice({
        productId: selectedProduct,
        locationId: selectedLocation,
        price: parseFloat(basePriceValue),
      })

      if (res.success) {
        setFeedback({ type: 'success', message: 'Preço base cadastrado com sucesso!' })
        setSelectedProduct('')
        setSelectedLocation('')
        setBasePriceValue('')
      } else {
        setFeedback({ type: 'error', message: res.error || 'Erro ao registrar preço base.' })
      }
    })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Localidades e Preços Base</h1>
          <p className="text-sm text-gray-500">Cadastre regiões geográficas e atribua os preços base por localidade.</p>
        </div>

        {/* Tabs navigation */}
        <div className="flex bg-gray-100 p-1 rounded-lg border">
          <button
            onClick={() => { setActiveTab('localidades'); setFeedback(null) }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'localidades'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Localidades
          </button>
          <button
            onClick={() => { setActiveTab('precos'); setFeedback(null) }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'precos'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Preço Base / Custos
          </button>
        </div>
      </div>

      {/* Alerta de Feedback */}
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

      {/* ABA 1: CADASTRO E LISTAGEM DE LOCALIDADES */}
      {activeTab === 'localidades' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulário */}
          <div className="bg-white p-5 rounded-lg border shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Nova Localidade</h2>
            <form onSubmit={handleCreateLocation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nome da Região / Identificador</label>
                <input
                  type="text"
                  placeholder="Ex: Filial SP - Centro"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cidade</label>
                  <input
                    type="text"
                    placeholder="Ex: São Paulo"
                    value={locCity}
                    onChange={(e) => setLocCity(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">UF (Estado)</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="SP"
                    value={locState}
                    onChange={(e) => setLocState(e.target.value.toUpperCase())}
                    required
                    className="w-full px-3 py-2 border rounded-md text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">CEP (Opcional)</label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={locZipCode}
                  onChange={(e) => setLocZipCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {isPending ? 'Salvando...' : 'Cadastrar Localidade'}
              </button>
            </form>
          </div>

          {/* Tabela de Localidades */}
          <div className="lg:col-span-2 bg-white p-5 rounded-lg border shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Localidades Cadastradas</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600 border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-700 font-semibold">
                    <th className="py-2.5 px-3">Nome / Região</th>
                    <th className="py-2.5 px-3">Cidade / UF</th>
                    <th className="py-2.5 px-3">CEP</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {initialLocations.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-gray-400">
                        Nenhuma localidade cadastrada ainda.
                      </td>
                    </tr>
                  ) : (
                    initialLocations.map((loc) => (
                      <tr key={loc.id} className="border-b hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-medium text-gray-900">{loc.name}</td>
                        <td className="py-2.5 px-3">{loc.city} - {loc.state}</td>
                        <td className="py-2.5 px-3">{loc.zipCode || '-'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                              loc.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {loc.active ? 'Ativo' : 'Inativo'}
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

      {/* ABA 2: CADASTRO DE PREÇO BASE POR LOCALIDADE */}
      {activeTab === 'precos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulário */}
          <div className="bg-white p-5 rounded-lg border shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Definir Preço Base</h2>
            <form onSubmit={handleSetBasePrice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Produto</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Selecione um produto...</option>
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Custo: R$ {p.costPrice.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Localidade / Região</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Selecione uma localidade...</option>
                  {initialLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.city}/{loc.state})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Preço Base (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={basePriceValue}
                  onChange={(e) => setBasePriceValue(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {isPending ? 'Salvando...' : 'Salvar Preço Base'}
              </button>
            </form>
          </div>

          {/* Tabela de Preços Base */}
          <div className="lg:col-span-2 bg-white p-5 rounded-lg border shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Preços Base por Localidade</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600 border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-700 font-semibold">
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3">Custo Unitário</th>
                    <th className="py-2.5 px-3">Localidade</th>
                    <th className="py-2.5 px-3 text-right">Preço Base</th>
                  </tr>
                </thead>
                <tbody>
                  {initialBasePrices.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-gray-400">
                        Nenhum preço base cadastrado ainda.
                      </td>
                    </tr>
                  ) : (
                    initialBasePrices.map((bp) => (
                      <tr key={bp.id} className="border-b hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-medium text-gray-900">{bp.productName}</td>
                        <td className="py-2.5 px-3 text-gray-500">R$ {bp.costPrice.toFixed(2)}</td>
                        <td className="py-2.5 px-3">{bp.locationName}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-blue-600">
                          R$ {bp.price.toFixed(2)}
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
    </div>
  )
}
