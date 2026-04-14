self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Medical Bible', body: event.data ? event.data.text() : 'Reminder' }
  }

  const title = payload.title || 'Medical Bible reminder'
  const options = {
    body: payload.body || 'Open Medical Bible to review.',
    icon: payload.icon || '/app-icon.png',
    badge: payload.badge || '/app-icon.png',
    tag: payload.tag || undefined,
    data: {
      url: payload.url || '/app/profile',
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app/profile'
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      const url = new URL(client.url)
      if (url.pathname.startsWith('/app')) {
        client.focus()
        client.navigate(targetUrl)
        return
      }
    }
    await clients.openWindow(targetUrl)
  })())
})

