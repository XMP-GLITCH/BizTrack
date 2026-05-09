/**
 * BizTrack Notification Service
 * Handles local notifications for low-stock alerts.
 */

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return 'denied';
  }
}

export async function sendLowStockNotification(itemName, qty, businessName) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const title = `⚠️ Low Stock — ${businessName}`;
  const body = `${itemName} is almost out. Only ${qty} left.`;
  const options = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/favicon-32.png',
    tag: `low-stock-${itemName.replace(/\s+/g, '-').toLowerCase()}`,
    renotify: true,
    data: { url: '/' },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, { body, icon: '/pwa-192x192.png' });
  } catch (e) {
    console.error('[BizTrack] Notification error:', e);
  }
}
