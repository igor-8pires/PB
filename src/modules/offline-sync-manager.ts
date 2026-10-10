import { createOrderAction } from '@/app/pedidos/novo/actions'
import { getOfflineUser } from '@/components/offline-session'
import { db, type OfflineDraftOrder, type OfflineOrderItem } from './local-storage-db'

const STALE_SYNC_MS = 5 * 60 * 1000

export interface SyncProgress {
  total: number
  synced: number
  failed: number
  inProgress: boolean
}

let currentSync: Promise<SyncProgress> | null = null

export function createOfflineSyncId() {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi) throw new Error('Criptografia indisponível neste dispositivo.')
  if (cryptoApi.randomUUID) return cryptoApi.randomUUID()
  return Array.from(cryptoApi.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)).join('-')
}

async function claimPendingDrafts(userId: string) {
  const now = Date.now()
  const staleBefore = now - STALE_SYNC_MS

  return db.transaction('rw', db.draftOrders, async () => {
    const drafts = await db.draftOrders.where('sellerId').equals(userId).toArray()
    const claimed: OfflineDraftOrder[] = []

    for (const draft of drafts) {
      const startedAt = Date.parse(draft.syncStartedAt || draft.createdAt)
      const staleSync = draft.syncStatus === 'SYNCING' &&
        (!Number.isFinite(startedAt) || startedAt <= staleBefore)
      if (draft.syncStatus !== 'PENDING_SYNC' && !staleSync) continue
      if (draft.localId === undefined) continue

      const syncId = draft.syncId || createOfflineSyncId()
      const syncStartedAt = new Date(now).toISOString()
      await db.draftOrders.update(draft.localId, {
        syncId,
        syncStartedAt,
        syncStatus: 'SYNCING',
        syncError: null,
      })
      claimed.push({ ...draft, syncId, syncStartedAt, syncStatus: 'SYNCING', syncError: null })
    }

    return claimed
  })
}

async function runSync(onProgress?: (progress: SyncProgress) => void): Promise<SyncProgress> {
  const offlineUser = getOfflineUser()
  const progress: SyncProgress = {
    total: 0,
    synced: 0,
    failed: 0,
    inProgress: true,
  }

  if (!offlineUser || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    progress.inProgress = false
    onProgress?.(progress)
    return progress
  }

  const pending = await claimPendingDrafts(offlineUser.userId)
  progress.total = pending.length
  onProgress?.({ ...progress })

  for (const draft of pending) {
    if (draft.localId === undefined || !draft.syncId) continue

    try {
      const result = await createOrderAction({
        customerId: draft.customerId,
        offlineSyncId: draft.syncId,
        notes: draft.notes,
        items: draft.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          enteredUnit: item.enteredUnit,
          finalUnitPrice: item.finalUnitPrice,
        })),
      })

      if (result.success && result.orderId) {
        await db.draftOrders.update(draft.localId, {
          syncStatus: 'SYNCED',
          serverId: result.orderId,
          syncStartedAt: undefined,
          syncError: null,
        })
        progress.synced += 1
      } else {
        await db.draftOrders.update(draft.localId, {
          syncStatus: 'SYNC_ERROR',
          syncStartedAt: undefined,
          syncError: result.error || 'Erro de validação no servidor.',
        })
        progress.failed += 1
      }
    } catch {
      await db.draftOrders.update(draft.localId, {
        syncStatus: 'PENDING_SYNC',
        syncStartedAt: undefined,
        syncError: 'Falha de conexão com o servidor. Nova tentativa agendada.',
      })
      progress.failed += 1
    }

    onProgress?.({ ...progress })
  }

  progress.inProgress = false
  onProgress?.({ ...progress })
  return progress
}

export function syncPendingOrders(
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncProgress> {
  if (currentSync) return currentSync
  currentSync = runSync(onProgress).finally(() => {
    currentSync = null
  })
  return currentSync
}

export async function countPendingOrdersForOfflineUser(): Promise<number> {
  const offlineUser = getOfflineUser()
  if (!offlineUser) return 0

  return db.draftOrders
    .where('syncStatus')
    .anyOf('PENDING_SYNC', 'SYNCING')
    .filter((draft) => draft.sellerId === offlineUser.userId)
    .count()
}

export async function saveOfflineDraftOrder(order: {
  customerId: string
  sellerId?: string
  syncId?: string
  notes?: string
  total: number
  items: OfflineOrderItem[]
}): Promise<number> {
  const offlineUser = getOfflineUser()
  const sellerId = order.sellerId || offlineUser?.userId
  if (!sellerId) throw new Error('Usuário offline não identificado.')

  const localId = await db.draftOrders.add({
    ...order,
    sellerId,
    syncId: order.syncId || createOfflineSyncId(),
    createdAt: new Date().toISOString(),
    syncStatus: 'PENDING_SYNC',
    syncError: null,
  } as OfflineDraftOrder & Record<string, unknown>)

  return Number(localId)
}

export function registerAutoSyncListener(
  onSyncUpdate?: (progress: SyncProgress) => void,
) {
  if (typeof window === 'undefined') return

  const handleOnline = () => {
    void syncPendingOrders(onSyncUpdate).catch((error: unknown) => {
      console.error('Falha ao sincronizar pedidos offline:', error)
    })
  }

  window.addEventListener('online', handleOnline)
  if (navigator.onLine) handleOnline()

  return () => window.removeEventListener('online', handleOnline)
}

export const initAutoSync = registerAutoSyncListener
