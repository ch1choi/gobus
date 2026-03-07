self.addEventListener('push', (event) => {
  let data = { title: 'GO BUS!', body: '' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data.body = event.data.text();
    }
  }
  const options = {
    body: data.body || '출발 알람',
    icon: '/img/time_table01.jpeg',
    badge: '/img/time_table01.jpeg',
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(data.title || 'GO BUS!', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0 && clientList[0].focus) {
        clientList[0].focus();
      } else if (self.clients.openWindow) {
        self.clients.openWindow('/');
      }
    })
  );
});
