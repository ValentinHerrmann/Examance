<script lang="ts">
  import type { HardwareProfile } from "#lib/hardware/detect";
  import { t } from "#lib/i18n";
  import { Badge } from "#lib/components/ui";

  interface Props {
    hwProfile: HardwareProfile;
    inConstrainedMode?: boolean;
  }

  let { hwProfile, inConstrainedMode = false }: Props = $props();
</script>

<div class="mb-8 min-w-0 rounded-md border border-line bg-surface-raised p-5">
  <h3 class="m-0 text-base font-semibold text-content">{$t("scanning.hardwareCard.title")}</h3>
  <div class="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
    <div>{$t("scanning.hardwareCard.cpuCores")} <strong>{hwProfile.logicalCores}</strong></div>
    <div>{$t("scanning.hardwareCard.ramEstimate")} <strong>{hwProfile.estimatedRAMGB} GB</strong></div>
    <div>
      {$t("scanning.hardwareCard.wasmSimd")} <strong
        >{hwProfile.simdSupported ? $t("scanning.hardwareCard.supported") : $t("scanning.hardwareCard.notSupported")}</strong
      >
    </div>
    <div>
      {$t("scanning.hardwareCard.activeMode")}
      <Badge severity={inConstrainedMode ? "warning" : "primary"}>
        {inConstrainedMode
          ? $t("scanning.hardwareCard.modeConstrained")
          : $t("scanning.hardwareCard.modeParallel")}
      </Badge>
    </div>
  </div>
</div>
