// Fires `onRecover` when the browser regains connectivity or the tab becomes
// visible again after being backgrounded — the two situations where realtime
// subscriptions may have silently missed updates while away (laptop sleep,
// wifi drop, tab throttled in the background) and a manual refetch is the
// only way to catch up, since postgres_changes has no replay/backfill of its own.
export function onNetworkRecovery(onRecover: () => void): () => void {
  function handleOnline() {
    onRecover();
  }
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') onRecover();
  }

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
