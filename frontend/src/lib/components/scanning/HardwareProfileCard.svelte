<script lang="ts">
  import "./HardwareProfileCard.css";
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
