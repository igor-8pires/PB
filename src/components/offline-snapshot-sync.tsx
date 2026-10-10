'use client'

import { useEffect } from 'react'
import { getOfflineSnapshots } from '@/modules/offline/actions'
import { db } from '@/modules/local-storage-db'

export function OfflineSnapshotSync({
  userId,
  role,
}: {
  userId: string
  role: string
}) {
  useEffect(() => {
    let isDisposed = false
    let isSyncing = false

    const syncSnapshots = async () => {
      if (!navigator.onLine || isSyncing) return
      isSyncing = true

      try {
        const result = await getOfflineSnapshots()
        if (
          isDisposed ||
          !result.success ||
          result.userId !== userId ||
          result.role !== role
        ) {
          return
        }

        const savedAt = new Date().toISOString()
        await db.offlinePageSnapshots.bulkPut(
          result.snapshots.map(({ route, data }) => ({
            id: `${userId}:${route}`,
            userId,
            role,
            route,
            savedAt,
            data,
          })),
        )
      } catch (error) {
        console.error('Falha ao atualizar dados offline:', error)
      } finally {
        isSyncing = false
      }
    }

    void syncSnapshots()
    window.addEventListener('online', syncSnapshots)

    return () => {
      isDisposed = true
      window.removeEventListener('online', syncSnapshots)
    }
  }, [userId, role])

  return null
}
