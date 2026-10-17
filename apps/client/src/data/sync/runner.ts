/** One round at a time. Background checks retain the last visible result and
 * the polling delay starts after completion, including after a slow failure. */
export function startSyncRunner(options: {
  run: () => Promise<boolean>;
  onBusy: (busy: boolean) => void;
  onSuccess: () => void;
  onError: (error: unknown) => void;
  intervalMs?: number;
}) {
  let stopped = false;
  let running = false;
  let pending = false;
  let pendingForeground = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

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
      if (!stopped && completed) options.onSuccess();
    } catch (error) {
      if (!stopped) options.onError(error);
    } finally {
      running = false;
      if (!stopped) {
        options.onBusy(false);
        const again = pending;
        const nextForeground = pendingForeground;
        pending = false;
        pendingForeground = false;
        timer = setTimeout(() => void execute(nextForeground), again ? 300 : (options.intervalMs ?? 15000));
      }
    }
  };

  return {
    request(foreground = false) { void execute(foreground); },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
