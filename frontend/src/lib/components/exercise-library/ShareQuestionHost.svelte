<script lang="ts">
  import { translate } from "#lib/i18n";
  import { apiErrorMessage } from "#lib/api/client";
  import { sessionStore } from "#lib/stores/session";
  import { answerShareQuestion, shareQuestion } from "#lib/exercise-library/askToShare";
  import ShareExerciseModal from "./ShareExerciseModal.svelte";

  /** Shows the share question after an exercise was saved (issue #263). Mounted once in the root layout, so it stays when the editor (and the page that opened it) closes. */
  let busy = $state(false);
  let error = $state("");

  async function answer(share: boolean, remember: boolean) {
    const question = $shareQuestion;
    if (!question) return;
    busy = true;
    error = "";
    try {
      await answerShareQuestion(question, share, remember);
    } catch (err) {
      error = apiErrorMessage(err, translate("exercises.sharing.shareModal.afterSaveFailed"));
    } finally {
      busy = false;
    }
  }

  function dismiss() {
    // Closing without an answer asks again after the next save.
    error = "";
    shareQuestion.set(null);
  }
</script>

<ShareExerciseModal
  open={!!$shareQuestion}
  mode="afterSave"
  name={$shareQuestion?.name ?? ""}
  email={$sessionStore.email ?? ""}
  {busy}
  {error}
  onConfirm={(remember) => answer(true, remember)}
  onDecline={(remember) => answer(false, remember)}
  onClose={dismiss}
/>
