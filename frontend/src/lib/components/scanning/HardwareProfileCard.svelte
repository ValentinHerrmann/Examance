<script lang="ts">
  import "./HardwareProfileCard.css";
  import type { HardwareProfile } from "$lib/hardware/detect";
  import { t } from "$lib/i18n";

  export let hwProfile: HardwareProfile;
  export let inConstrainedMode: boolean = false;
</script>

<div class="hw-profile-card">
  <h3>{$t("scanning.hardwareCard.title")}</h3>
  <div class="grid grid-cols-1 gap-3 text-sm mt-2 sm:grid-cols-2">
    <div>{$t("scanning.hardwareCard.cpuCores")} <strong>{hwProfile.logicalCores}</strong></div>
    <div>{$t("scanning.hardwareCard.ramEstimate")} <strong>{hwProfile.estimatedRAMGB} GB</strong></div>
    <div>
      {$t("scanning.hardwareCard.wasmSimd")} <strong
        >{hwProfile.simdSupported ? $t("scanning.hardwareCard.supported") : $t("scanning.hardwareCard.notSupported")}</strong
      >
    </div>
    <div>
      {$t("scanning.hardwareCard.activeMode")}
      <span class="mode-tag" class:constrained={inConstrainedMode}>
        {inConstrainedMode
          ? $t("scanning.hardwareCard.modeConstrained")
          : $t("scanning.hardwareCard.modeParallel")}
      </span>
    </div>
  </div>
</div>
