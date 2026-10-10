'use client'

import { useEffect } from 'react'
import { db, OfflinePageSnapshot } from '@/modules/local-storage-db'

export const OFFLINE_USER_KEY = 'sistema-vendas-offline-user'

export interface OfflineUser {
  userId: string
  role: string
}

export function getOfflineUser(): OfflineUser | null {
  if (typeof window === 'undefined') return null

  try {
    const value = localStorage.getItem(OFFLINE_USER_KEY)
    return value ? (JSON.parse(value) as OfflineUser) : null
  } catch {
    return null
  }
}

export async function clearOfflineSnapshots(userId: string) {
  await db.offlinePageSnapshots.where('userId').equals(userId).delete()

  const currentUser = getOfflineUser()
  if (currentUser?.userId === userId) {
    localStorage.removeItem(OFFLINE_USER_KEY)
  }
}

export function OfflineUserSession({ userId, role }: OfflineUser) {
  useEffect(() => {
    const previousUser = getOfflineUser()
    if (previousUser && previousUser.userId !== userId) {
      void clearOfflineSnapshots(previousUser.userId)
    }
    localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({ userId, role }))
  }, [userId, role])

  return null
}

export function OfflineSnapshotWriter({
  userId,
  role,
  route,
  data,
}: OfflineUser & { route: string; data: unknown }) {
  useEffect(() => {
    const snapshot: OfflinePageSnapshot = {
      id: `${userId}:${route}`,
      userId,
      role,
      route,
      savedAt: new Date().toISOString(),
      data,
    }
    void db.offlinePageSnapshots.put(snapshot).catch((error: unknown) => {
      console.error('Não foi possível salvar o snapshot offline:', error)
    })
  }, [userId, role, route, data])

  return null
}
