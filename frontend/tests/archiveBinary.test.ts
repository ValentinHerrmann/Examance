import { describe, expect, it } from 'vitest';
import { decodeBinary, encodeBinary } from '../src/lib/archive/binary';

describe('archive byte encoding', () => {
  it('round-trips byte arrays through JSON', () => {
    const payload = { submissions: [{ id: 's1', scanBytes: new Uint8Array([37, 80, 68, 70]) }] };
    const back = decodeBinary(JSON.parse(JSON.stringify(encodeBinary(payload)))) as typeof payload;
    expect(back.submissions[0].scanBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(back.submissions[0].scanBytes)).toEqual([37, 80, 68, 70]);
  });

  it('reads the numbered-key objects old archives wrote for byte fields', () => {
    // What JSON.stringify(new Uint8Array([1, 2, 3])) produced in archives before `$b64`.
    const legacy = JSON.parse('{"scanCt":{"0":1,"1":2,"2":3},"meta":{"0":"x"}}');
    const back = decodeBinary(legacy) as { scanCt: Uint8Array; meta: Record<string, string> };
    expect(Array.from(back.scanCt)).toEqual([1, 2, 3]);
    // Only known byte fields are converted.
    expect(back.meta).toEqual({ 0: 'x' });
  });

  it('leaves ordinary values alone', () => {
    const payload = { title: 'Exam', points: [1, 2], nested: { ok: true } };
    expect(decodeBinary(JSON.parse(JSON.stringify(encodeBinary(payload))))).toEqual(payload);
  });
});
