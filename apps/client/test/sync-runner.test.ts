import { afterEach, expect, it, vi } from 'vitest';
import { startSyncRunner } from '../src/data/sync/runner';

afterEach(() => vi.useRealTimers());

it('сохраняет сообщение об ошибке во время фонового повтора и снимает его после успеха', async () => {
  vi.useFakeTimers();
  let release!: (done: boolean) => void;
  let busy = false;
  let message = '';
  const run = vi.fn<() => Promise<boolean>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const runner = startSyncRunner({ run, onBusy: value => { busy = value; },
    onError: () => { message = 'offline'; }, onSuccess: () => { message = 'synced'; } });
  runner.request(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(busy).toBe(false);
  expect(message).toBe('offline');
  await vi.advanceTimersByTimeAsync(15000);
  expect(run).toHaveBeenCalledTimes(2);
  expect(busy).toBe(false);
  expect(message).toBe('offline');
  release(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(message).toBe('synced');
  runner.stop();
});

it('не запускает параллельные проверки, объединяет правки и отсчитывает интервал после завершения', async () => {
  vi.useFakeTimers();
  let release!: (done: boolean) => void;
  const run = vi.fn<() => Promise<boolean>>()
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValue(true);
  const runner = startSyncRunner({ run, onBusy: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() });
  runner.request(true);
  await vi.advanceTimersByTimeAsync(40000);
  expect(run).toHaveBeenCalledTimes(1);
  runner.request(); runner.request(); runner.request();
  release(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(run).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(14999);
  expect(run).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(3);
  runner.stop();
});

it('после закрытия экрана не меняет состояние и не запускает новые проверки', async () => {
  vi.useFakeTimers();
  let release!: (done: boolean) => void;
  const success = vi.fn(), error = vi.fn();
  const run = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
  const runner = startSyncRunner({ run, onBusy: vi.fn(), onSuccess: success, onError: error });
  runner.request(true); runner.request(); runner.stop(); release(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(run).toHaveBeenCalledTimes(1);
  expect(success).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
