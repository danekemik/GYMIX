/** One round at a time. Background checks retain the last visible result and
 * the polling delay starts after completion, including after a slow failure.
 * Repeated failures back off exponentially so a server outage does not turn
 * into a permanent request loop. */
export function startSyncRunner(options: {
  run: () => Promise<boolean>;
  onBusy: (busy: boolean) => void;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  intervalMs?: number;
  maxIntervalMs?: number;
}) {
  let stopped = false;
  let running = false;
  let pending = false;
  let pendingForeground = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const backoff = () => {
    const interval = options.intervalMs ?? 15000;
    const max = options.maxIntervalMs ?? 300000;
    return Math.min(interval * 2 ** Math.max(0, failures - 1), max);
  };

  const execute = async (foreground: boolean) => {
    if (stopped) return;
    if (running) {
      pending = true;
      pendingForeground ||= foreground;
      return;
    }
    clearTimeout(timer);
    running = true;
    if (foreground) options.onBusy(true);
    try {
      const completed = await options.run();
      if (!stopped && completed) {
        failures = 0;
        options.onSuccess();
      }
    } catch (error) {
      if (!stopped) {
        failures += 1;
        options.onError(error);
      }
    } finally {
      running = false;
      if (!stopped) {
        options.onBusy(false);
        const again = pending;
        const nextForeground = pendingForeground;
        pending = false;
        pendingForeground = false;
        timer = setTimeout(() => void execute(nextForeground), again ? 300 : backoff());
      }
    }
  };

  return {
    request(foreground = false) { void execute(foreground); },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
