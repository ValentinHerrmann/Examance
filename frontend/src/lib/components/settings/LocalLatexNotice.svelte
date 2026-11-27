<script lang="ts">
  /** Moves every browser to the browser LaTeX engine once, with a one-time explanation and a way back; offers the server after the engine failed here (docs/dev/latex.md). */
  import { untrack } from "svelte";
  import { HeroDialog } from "#lib/components/ui";
  import { latexPlaceIcons } from "#lib/components/storage/placeIcons";
  import { t } from "#lib/i18n";
  import { capabilitiesStore } from "#lib/stores/capabilities";
  import { localSwitchPending, markLocalSwitch, storagePolicyStore, switchToLocalOnce } from "#lib/stores/storagePolicy";
  import { workspaceStatusStore } from "#lib/stores/workspaceState";
  import { engineFallbackStore } from "#lib/latex/compiler";
  import { safeSessionStorage } from "#lib/utils/storage";

  const OFFER_SHOWN_KEY = "bg_latex_server_offer_shown";

  let switchedOpen = $state(false);
  let offerOpen = $state(false);
  /** A new account chooses its storage mode first; it never knew server compilation, so it moves without a word. */
  let sawFirstChoice = false;

  function decide(state: string, serverAllowed: boolean | undefined) {
    if (state === "needs-choice") sawFirstChoice = true;
    if (!localSwitchPending()) return;
    if (state === "admin" || (state === "ok" && serverAllowed === false)) return markLocalSwitch();
    if (state !== "ok" || serverAllowed === undefined) return;
    if (sawFirstChoice) {
      switchToLocalOnce();
      return;
    }
    switchedOpen = switchToLocalOnce();
  }

  function keepServer() {
    storagePolicyStore.updateSetting("latexCompilation", "server");
    switchedOpen = false;
  }

  function useServerFromNowOn() {
    storagePolicyStore.updateSetting("latexCompilation", "server");
    offerOpen = false;
  }

  $effect.pre(() => {
    const state = $workspaceStatusStore.state;
    const caps = $capabilitiesStore;
    untrack(() => decide(state, caps ? caps.features.server_latex === true : undefined));
  });

  $effect.pre(() => {
    const failed = $engineFallbackStore;
    untrack(() => {
      if (!failed || offerOpen || safeSessionStorage.getItem(OFFER_SHOWN_KEY)) return;
      engineFallbackStore.set(false);
      if ($storagePolicyStore.latexCompilation !== "local") return;
      safeSessionStorage.setItem(OFFER_SHOWN_KEY, "1");
      offerOpen = true;
    });
  });
</script>

<HeroDialog
  open={switchedOpen}
  icon={latexPlaceIcons.local}
  tone="info"
  title={$t("settings.latex.switchedTitle")}
  body={$t("settings.latex.switchedBody")}
  primary={{ label: $t("settings.latex.switchedOk"), onClick: () => (switchedOpen = false) }}
  secondary={{ label: $t("settings.latex.keepServer"), onClick: keepServer }}
/>

<HeroDialog
  open={offerOpen}
  icon={latexPlaceIcons.server}
  tone="info"
  title={$t("settings.latex.fallbackTitle")}
  body={$t("settings.latex.fallbackBody")}
  primary={{ label: $t("settings.latex.fallbackSwitch"), onClick: useServerFromNowOn }}
  secondary={{ label: $t("settings.latex.fallbackKeep"), onClick: () => (offerOpen = false) }}
/>
