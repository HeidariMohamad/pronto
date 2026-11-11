let registrationPromise;

export function startUpdateChecks() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  registrationPromise = navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  const check = () => {
    if (navigator.onLine && document.visibilityState === 'visible') {
      registrationPromise.then(registration => registration.update()).catch(() => {});
    }
  };
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  window.setInterval(check, 60 * 60 * 1000);
  registrationPromise.then(() => check()).catch(() => {});
}

export async function refreshApp() {
  if (!('serviceWorker' in navigator)) { window.location.reload(); return; }
  try {
    const registration = registrationPromise ? await registrationPromise : await navigator.serviceWorker.getRegistration();
    if (registration && navigator.onLine) {
      await registration.update();
      const worker = registration.installing || registration.waiting;
      if (worker && worker.state !== 'activated' && worker.state !== 'redundant') {
        await new Promise(resolve => {
          const timer = window.setTimeout(resolve, 15000);
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated' || worker.state === 'redundant') { clearTimeout(timer); resolve(); }
          });
          if (worker.state === 'activated' || worker.state === 'redundant') { clearTimeout(timer); resolve(); }
        });
      }
    }
  } catch { /* Reload the cached app when offline or update checks fail. */ }
  window.location.reload();
}
