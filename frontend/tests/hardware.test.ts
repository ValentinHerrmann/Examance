import { describe, it, expect } from 'vitest';
import { detectHardware, PipelineMonitor } from '../src/lib/hardware/detect';

describe('Hardware Detection & Pipeline Monitor', () => {
  it('detects hardware profile correctly', () => {
    const profile = detectHardware();
    expect(profile.logicalCores).toBeGreaterThanOrEqual(1);
    expect(['parallel', 'constrained']).toContain(profile.recommendedMode);
  });

  it('falls back instead of throwing when there is no navigator global', async () => {
    // `navigator` only became a Node global in Node 21, and does not exist
    // under SSR/prerendering either. CI pins Node 20, so an unguarded read
    // here crashed there while passing on newer local Node versions.
    const had = 'navigator' in globalThis;
    const original = (globalThis as any).navigator;
    delete (globalThis as any).navigator;
    try {
      const profile = detectHardware();
      expect(profile.logicalCores).toBe(2);
      expect(profile.estimatedRAMGB).toBe(2);
      expect(profile.recommendedMode).toBe('constrained');
    } finally {
      if (had) (globalThis as any).navigator = original;
    }
  });

  it('triggers downgrade event when memory threshold is exceeded', () => {
    const monitor = new PipelineMonitor({
      logicalCores: 8,
      estimatedRAMGB: 8,
      simdSupported: true,
      fileSystemAccessAPI: true,
      recommendedMode: 'parallel',
    });

    let downgradeFired = false;
    monitor.on('downgrade', () => {
      downgradeFired = true;
    });

    expect(monitor.inConstrainedMode).toBe(false);

    // Trigger explicit downgrade
    monitor.triggerDowngrade();

    expect(downgradeFired).toBe(true);
    expect(monitor.inConstrainedMode).toBe(true);
  });
});
