<script lang="ts">
  import { onMount } from "svelte";
  import { faBan, faGear, faImage, faUpload } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, OptionTile } from "#lib/components/ui";
  import LogoPreview from "./LogoPreview.svelte";
  import {
    LOGO_ACCEPT,
    LogoError,
    fetchAccountLogo,
    fetchExamLogo,
    getAccountLogoInfo,
    getExamLogoInfo,
    readLogoFile,
    sniffLogoMime,
    type ExamLogoChange,
    type ExamLogoMode,
    type LogoMime,
  } from "#lib/latex/logo";

  /** An exam's logo choice (issue #46): the account logo, no logo, or the exam's own. Nothing is written here; the choice is staged in `change` and the exam page applies it on save. */
  interface Props {
    examId: string;
    /** Null while the choice equals what the exam already has. */
    change?: ExamLogoChange | null;
  }

  let { examId, change = $bindable(null) }: Props = $props();

  let loading = $state(true);
  let error = $state("");
  let savedMode = $state<ExamLogoMode>("account");
  let mode = $state<ExamLogoMode>("account");
  let accountBytes = $state.raw<Uint8Array | null>(null);
  let accountMime = $state<LogoMime | null>(null);
  let storedCustom = $state.raw<Uint8Array | null>(null);
  let picked = $state.raw<Uint8Array | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  let customBytes = $derived(picked ?? storedCustom);
  let customMime = $derived(customBytes ? sniffLogoMime(customBytes) : null);
  let needsFile = $derived(mode === "custom" && !customBytes);

  function updateChange() {
    if (mode === "custom" && !customBytes) {
      change = null;
    } else if (mode === savedMode && !picked) {
      change = null;
    } else {
      change = { mode, ...(mode === "custom" && picked ? { bytes: picked } : {}) };
    }
  }

  function selectMode(next: ExamLogoMode) {
    mode = next;
    updateChange();
    if (next === "custom" && !customBytes) fileInput?.click();
  }

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    error = "";
    try {
      picked = (await readLogoFile(file)).bytes;
      mode = "custom";
      updateChange();
    } catch (err) {
      error = err instanceof LogoError ? translate(err.key) : (err as Error).message;
    }
  }

  onMount(async () => {
    change = null;
    try {
      const [examInfo, accountInfo] = await Promise.all([getExamLogoInfo(examId), getAccountLogoInfo()]);
      savedMode = mode = examInfo.mode;
      if (accountInfo.source !== "none") {
        accountBytes = await fetchAccountLogo();
        accountMime = accountInfo.mime_type;
      }
      if (examInfo.mode === "custom") storedCustom = await fetchExamLogo(examId);
    } catch (err) {
      error = (err as Error)?.message || translate("logo.errors.generic");
    } finally {
      loading = false;
    }
  });
</script>

<fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={loading}>
  <legend class="mb-1 p-0 text-sm font-medium text-content">{$t("logo.exam.heading")}</legend>
  {#if error}
    <Alert severity="danger" onDismiss={() => (error = "")}>{error}</Alert>
  {/if}

  <!-- Choices as tiles like every setting (issue #228); what the chosen one needs shows under them. -->
  <div class="@container" role="radiogroup" aria-label={$t("logo.exam.heading")}>
    <div class="grid grid-cols-1 gap-2 @xs:grid-cols-3">
      <OptionTile compact name="examLogoMode" value="account" checked={mode === "account"} icon={faGear} title={$t("logo.exam.account")} text={$t("logo.exam.accountText")} onchange={() => selectMode("account")} />
      <OptionTile compact name="examLogoMode" value="none" checked={mode === "none"} icon={faBan} title={$t("logo.exam.none")} text={$t("logo.exam.noneText")} onchange={() => selectMode("none")} />
      <OptionTile compact name="examLogoMode" value="custom" checked={mode === "custom"} icon={faImage} title={$t("logo.exam.custom")} text={$t("logo.exam.customText")} onchange={() => selectMode("custom")} />
    </div>
  </div>
  {#if mode === "account"}
    <div class="flex flex-wrap items-center gap-3">
      <LogoPreview bytes={accountBytes} mime={accountMime} />
      {#if !loading && !accountBytes}
        <span class="text-xs text-muted">
          {$t("logo.exam.noAccountLogo")}
          <a href="/settings#logo" class="link">{$t("logo.exam.toSettings")}</a>
        </span>
      {/if}
    </div>
  {:else if mode === "custom"}
    <div class="flex flex-wrap items-center gap-3">
      <LogoPreview bytes={customBytes} mime={customMime} />
      <Button variant="outlined" size="sm" icon={faUpload} onClick={() => fileInput?.click()}>
        {customBytes ? $t("logo.replace") : $t("logo.upload")}
      </Button>
    </div>
    {#if needsFile}
      <p class="m-0 text-xs text-warning-fg">{$t("logo.exam.needsFile")}</p>
    {/if}
  {/if}

  <input bind:this={fileInput} type="file" accept={LOGO_ACCEPT} class="hidden" onchange={handleFile} />
  <p class="m-0 text-xs text-muted">{$t("logo.formats")}</p>
</fieldset>
