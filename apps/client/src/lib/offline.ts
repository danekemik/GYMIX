/** A new build activates after all tabs using the previous build close.
 * This avoids replacing JS/WASM underneath an in-progress workout. */
export function registerOfflineSupport(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .catch((error: unknown) => console.error('Не удалось подготовить сайт для работы без интернета', error));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
