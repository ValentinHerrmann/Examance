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

<!-- One line under the upload button: it only explains the speed, so it gets no card of its own (issue #212). -->
<p class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label={$t("scanning.hardwareCard.title")}>
  <span>{$t("scanning.hardwareCard.cpuCores")} <strong class="text-content">{hwProfile.logicalCores}</strong></span>
  <span>{$t("scanning.hardwareCard.ramEstimate")} <strong class="text-content">{hwProfile.estimatedRAMGB} GB</strong></span>
  <span>{$t("scanning.hardwareCard.wasmSimd")} <strong class="text-content">{hwProfile.simdSupported ? $t("scanning.hardwareCard.supported") : $t("scanning.hardwareCard.notSupported")}</strong></span>
  <Badge size="xs" severity={inConstrainedMode ? "warning" : "primary"}>
    {inConstrainedMode ? $t("scanning.hardwareCard.modeConstrained") : $t("scanning.hardwareCard.modeParallel")}
  </Badge>
</p>
