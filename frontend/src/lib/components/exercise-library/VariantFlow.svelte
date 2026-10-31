<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import { api } from "#lib/api/client";
  import { createDirtyClose } from "#lib/utils/dirtyClose.svelte";
  import { translate } from "#lib/i18n";
  import VariantModal from "./VariantModal.svelte";

  interface Props {
    /** Reloads the library after a variant was created. */
    onSaved: () => Promise<void> | void;
  }

  let { onSaved }: Props = $props();

  let isOpen = $state(false);
  let error = $state("");
  let baseEx: ExerciseRecord | null = $state.raw(null);
  let variantKey = $state("");
  let variantLatexBody = $state("");
  let initialLatexBody = $state("");

  // The key starts empty, so any text in it is a change.
  let isDirty = $derived(variantKey !== "" || variantLatexBody !== initialLatexBody);

  const dirtyClose = createDirtyClose({
    isDirty: () => isDirty,
    onClose: () => (isOpen = false),
  });

  /** Opens the dialog for a new variant of `ex`, seeded with its LaTeX. */
  export function open(ex: ExerciseRecord) {
    error = "";
    baseEx = ex;
    variantKey = "";
    variantLatexBody = ex.latexBody || "";
    initialLatexBody = variantLatexBody;
    dirtyClose.cancel();
    isOpen = true;
  }

  async function save() {
    error = "";
    if (!baseEx) return;
    if (!variantKey.trim()) {
      error = translate("exercises.page.variantKeyRequired");
      return;
    }

    try {
      await api.post(`/exercises/${baseEx.id}/new-variant`, {
        latex_body: variantLatexBody,
        variant_key: variantKey,
      });

      dirtyClose.force();
      await onSaved();
    } catch (err: any) {
      error = translate("exercises.page.variantCreateFailed", { message: err.message });
    }
  }
</script>

<VariantModal
  {isOpen}
  {error}
  variantBaseEx={baseEx}
  bind:variantKey
  bind:variantLatexBody
  showConfirmClose={dirtyClose.confirming}
  onRequestClose={dirtyClose.request}
  onSave={save}
  onForceCloseConfirm={dirtyClose.force}
  onCancelConfirmClose={dirtyClose.cancel}
/>
