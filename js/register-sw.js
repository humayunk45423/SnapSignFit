if ('serviceWorker' in navigator) {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const reg of regs) {
        reg.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.update();
      }).catch(() => {});
    });
  }
}
