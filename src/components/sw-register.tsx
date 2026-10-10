'use client'

import { useEffect } from 'react'

export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return

    const register = () => {
      void navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registrado com sucesso:', registration.scope)
        })
        .catch((error) => {
          console.error('Falha ao registrar Service Worker:', error)
        })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
