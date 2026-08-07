<script lang="ts">
  import type { HardwareProfile } from "$lib/hardware/detect";

  export let hwProfile: HardwareProfile;
  export let inConstrainedMode: boolean = false;
</script>

<div class="hw-profile-card">
  <h3>Hardware Environment Profile</h3>
  <div class="profile-grid">
    <div>CPU Cores: <strong>{hwProfile.logicalCores}</strong></div>
    <div>RAM Estimate: <strong>{hwProfile.estimatedRAMGB} GB</strong></div>
    <div>
      WASM SIMD: <strong
        >{hwProfile.simdSupported ? "Supported" : "Not Supported"}</strong
      >
    </div>
    <div>
      Active Mode:
      <span class="mode-tag" class:constrained={inConstrainedMode}>
        {inConstrainedMode
          ? "Constrained Assembly-Line"
          : "Parallel Multi-Core"}
      </span>
    </div>
  </div>
</div>

<style>
  .hw-profile-card {
    background: #1e293b;
    padding: 1.25rem;
    border-radius: 8px;
    margin-bottom: 2rem;
    border: 1px solid #334155;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .mode-tag {
    background: #0284c7;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .mode-tag.constrained {
    background: #eab308;
    color: black;
  }
</style>
