/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { APP_NAME, APP_SLUG } from './lib/config'

// Precache the app shell so cached data is viewable offline.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA navigation fallback
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.skipWaiting()
clientsClaim()

// ---------------------------------------------------------------------------
// Push reminders (follow-ups due, key-date countdowns) — payload is JSON
// { title, body } sent by the send-reminders edge function.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: { title?: string; body?: string }
  try {
    payload = event.data.json()
  } catch {
    payload = { body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? APP_NAME, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `${APP_SLUG}-daily`,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => 'focus' in c)
      if (open) return (open as WindowClient).focus()
      return self.clients.openWindow('/')
    }),
  )
})
