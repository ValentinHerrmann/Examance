import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/hardware/detect', () => ({
  detectHardware: () => ({
    logicalCores: 2,
    estimatedRAMGB: 8,
    simdSupported: true,
    fileSystemAccessAPI: false,
    recommendedMode: 'parallel',
  }),
  PipelineMonitor: class {},
}));

import { WorkerPool } from '../src/lib/workers/pool';

class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  terminated = false;
  postMessage(msg: unknown) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
  crash() {
    this.dispatchEvent(Object.assign(new Event('error'), { message: 'boom' }));
  }
}

function makePool() {
  const workers: FakeWorker[] = [];
  const pool = new WorkerPool<string, string>(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  return { pool, workers };
}

describe('WorkerPool', () => {
  it('never hands a crashed worker’s late reply to the next task', async () => {
    const { pool, workers } = makePool();
    pool.downgradePoolSize(1);
    const [first] = workers;

    const failed = pool.dispatch('a');
    first.crash();
    await expect(failed).rejects.toThrow('boom');
    expect(first.terminated).toBe(true);

    const next = pool.dispatch('b');
    first.reply('late answer for a');
    const replacement = workers.find((w) => w.posted.includes('b'))!;
    expect(replacement).not.toBe(first);
    replacement.reply('answer for b');
    await expect(next).resolves.toBe('answer for b');
  });

  it('terminates a busy worker removed by a downgrade once its task settles', async () => {
    const { pool, workers } = makePool();
    const tasks = [pool.dispatch('a'), pool.dispatch('b')];
    pool.downgradePoolSize(1);
    const retired = workers[1];
    expect(retired.terminated).toBe(false);

    retired.reply('answer for b');
    expect(retired.terminated).toBe(true);
    workers[0].reply('answer for a');
    await expect(Promise.all(tasks)).resolves.toEqual(['answer for a', 'answer for b']);
  });
});
