import { expect, it, vi } from 'vitest';
import { SaveQueue } from '../src/lib/saveQueue';

it('flush waits for edits made during an earlier save and coalesces intermediate values', async () => {
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  const save = vi.fn(async (value: number) => { if (value === 1) await first; });
  const queue = new SaveQueue(save);
  queue.update(1);
  const pending = queue.flush();
  queue.update(2); queue.update(3);
  expect(queue.flush()).toBe(pending);
  release(); await pending;
  expect(save.mock.calls.map(([value]) => value)).toEqual([1, 3]);
  await queue.flush(); expect(save).toHaveBeenCalledTimes(2);
});

it('a failed write remains pending for an explicit retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
  const queue = new SaveQueue(save);
  queue.update('latest');
  await expect(queue.flush()).rejects.toThrow('disk');
  await queue.flush();
  expect(save.mock.calls).toEqual([['latest'], ['latest']]);
});
