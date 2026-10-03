<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { page } from "$app/stores";
  import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
  import { httpErrorStore } from "$lib/stores/httpErrorStore";
  import { t, translate } from "$lib/i18n";
  import { Button, Icon, PageShell } from "$lib/components/ui";

  let status = $derived($page.status || 404);
  let message = $derived($page.error?.message || translate("dashboard.error.notFound"));

  $effect.pre(() => {
    const s = status;
    const m = message;
    if (typeof window === "undefined" || !s) return;
    untrack(() => httpErrorStore.showError(s, m));
  });

  onMount(() => {
    httpErrorStore.showError(status, message);
  });
</script>

<PageShell width="form" class="grow">
  <div class="flex flex-col items-center gap-4 py-12 text-center">
    <span
      class="flex size-14 items-center justify-center rounded-xl border border-line-strong text-2xl text-primary"
      aria-hidden="true"
    >
      <Icon icon={faTriangleExclamation} />
    </span>
    <h1 class="m-0 text-2xl font-normal text-content">
      {$t("dashboard.error.title", { status })}
    </h1>
    <p class="m-0 max-w-prose text-muted">{message}</p>
    <Button href="/">{$t("dashboard.error.returnButton")}</Button>
  </div>
</PageShell>
