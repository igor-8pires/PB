'use client'

import React, { useState, useEffect, useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  countPendingOrdersForOfflineUser,
  syncPendingOrders,
  registerAutoSyncListener,
} from '@/modules/offline-sync-manager'

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

export function SyncStatusBar() {
  const router = useRouter()
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineStatus,
    getServerOnlineStatus,
  )
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    const checkPendingOrders = async () => {
      try {
        const count = await countPendingOrdersForOfflineUser()
        setPendingCount(count)
      } catch (err) {
        console.error('Erro ao verificar rascunhos pendentes:', err)
      }
    }

    const initialCheck = window.setTimeout(() => {
      void checkPendingOrders()
    }, 0)
    const interval = setInterval(checkPendingOrders, 3000)

    const unregisterSync = registerAutoSyncListener(() => {
      checkPendingOrders()
    })

    return () => {
      window.clearTimeout(initialCheck)
      clearInterval(interval)
      if (unregisterSync) unregisterSync()
    }
  }, [])

  const handleManualSync = async () => {
    if (!navigator.onLine || isSyncing) return
    setIsSyncing(true)
    setSyncMessage('Sincronizando rascunhos com o servidor...')

    try {
      const results = await syncPendingOrders()
      const successCount = results.synced
      const errorCount = results.failed

      if (results.total > 0) {
        setSyncMessage(`Sincronização concluída: ${successCount} salvos, ${errorCount} com erro.`)
        if (successCount > 0) router.refresh()
      } else {
        setSyncMessage('Nenhum pedido pendente de sincronização.')
      }

      setTimeout(() => setSyncMessage(null), 4000)
    } catch {
      setSyncMessage('Erro durante a sincronização.')
    } finally {
      setIsSyncing(false)
      const count = await countPendingOrdersForOfflineUser()
      setPendingCount(count)
    }
  }

  return (
    <div
      className={`w-full px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between shadow-sm ${
        !isOnline
          ? 'bg-amber-500 text-white'
          : pendingCount > 0
          ? 'bg-blue-600 text-white'
          : 'bg-green-600 text-white'
      }`}
    >
      <div className="flex items-center space-x-2">
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              !isOnline ? 'bg-amber-200' : 'bg-blue-200'
            }`}
          ></span>
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              !isOnline ? 'bg-amber-100' : 'bg-white'
            }`}
          ></span>
        </span>
        <span>
          {!isOnline
            ? 'Modo Offline: Operando com cache local. Os pedidos serão salvos no dispositivo.'
            : syncMessage || (pendingCount > 0
              ? `${pendingCount} pedido(s) rascunho pendente(s) de sincronização.`
              : 'Tudo sincronizado.')}
        </span>
      </div>

      {isOnline && (
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="inline-flex shrink-0 items-center gap-2 rounded bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      )}
    </div>
  )
}
