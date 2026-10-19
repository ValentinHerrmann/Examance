<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { t, locale } from "#lib/i18n";
  import { isUnlocked } from "#lib/stores/session";
  import { POSTERS, posterById, type PosterId } from "#lib/about/posters";
  import PdfEmbedViewer from "#lib/components/PdfEmbedViewer.svelte";
  import { Alert, Button, Card, PageHeader, PageShell, Tabs } from "#lib/components/ui";
  import { faDownload, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

  // Public page (issue #119): the posters bundled from docs/posters, served from our own origin.
  let poster = $derived(posterById(page.url.searchParams.get("poster")));

  function select(id: string) {
    goto(`?poster=${id as PosterId}`, { replace: true, reset: false });
  }
</script>

<svelte:head>
  <title>{$t("about.title")} — Examance</title>
</svelte:head>

<PageShell width="wide">
  <PageHeader
    level="h1"
    title={$t("about.title")}
    subtitle={$t("about.subtitle")}
    back={$isUnlocked ? undefined : { href: "/unlock", label: $t("about.backToSignIn") }}
  />

  {#if $locale !== "de"}
    <Alert severity="info" class="mb-4">{$t("about.germanOnly")}</Alert>
  {/if}

  <Card padded={false} class="flex min-w-0 flex-col">
    <Tabs
      items={POSTERS.map((p) => ({ id: p.id, label: $t(`about.posters.${p.id}.title`) }))}
      value={poster.id}
      label={$t("about.tabsLabel")}
      onChange={select}
    />
    <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <p class="m-0 min-w-0 text-sm text-muted">{$t(`about.posters.${poster.id}.description`)}</p>
      <div class="flex shrink-0 flex-wrap gap-2">
        <Button
          href={poster.url}
          target="_blank"
          rel="noopener"
          variant="outlined"
          severity="secondary"
          size="sm"
          icon={faUpRightFromSquare}
        >{$t("about.openPdf")}</Button>
        <Button
          href={poster.url}
          download={poster.fileName}
          variant="outlined"
          severity="secondary"
          size="sm"
          icon={faDownload}
        >{$t("about.downloadPdf")}</Button>
      </div>
    </div>
    <!-- A3 posters: tall enough to read a page, the viewer scrolls and zooms inside. -->
    <div class="h-[75dvh] min-h-96 border-t border-line">
      {#key poster.id}
        <PdfEmbedViewer src={poster.url} />
      {/key}
    </div>
  </Card>
</PageShell>
