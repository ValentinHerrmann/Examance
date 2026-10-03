<script lang="ts">
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import { t } from "$lib/i18n";
  import { PageShell, PageHeader, Icon } from "$lib/components/ui";

  /** Page heading, e.g. "Impressum". */
  export let title: string;
  /** Short line under the heading. */
  export let subtitle: string = "";
</script>

<PageShell width="narrow">
  <article class="leading-relaxed text-content">
    <PageHeader {title} subtitle={subtitle || undefined} />

    <!-- The page bodies are plain h2/p/ul markup written in the route files, so they are styled from here. -->
    <div
      class="[&_.placeholder]:inline-block [&_.placeholder]:rounded-sm [&_.placeholder]:bg-warning/20 [&_.placeholder]:px-1 [&_.placeholder]:font-mono [&_.placeholder]:text-sm [&_.placeholder]:text-warning-fg [&_.todo-banner]:mx-0 [&_.todo-banner]:mt-0 [&_.todo-banner]:mb-6 [&_.todo-banner]:rounded-md [&_.todo-banner]:border [&_.todo-banner]:border-warning/40 [&_.todo-banner]:bg-warning/10 [&_.todo-banner]:px-4 [&_.todo-banner]:py-3 [&_.todo-banner]:text-sm [&_.todo-banner]:text-warning-fg [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-content [&_li]:text-sm [&_p]:text-sm [&_ul]:pl-5"
    >
      <slot />
    </div>

    <footer class="mt-8 border-t border-line pt-4">
      <a href="/" class="link inline-flex items-center gap-2 text-sm">
        <Icon icon={faArrowLeft} />{$t("legal.backToHome")}
      </a>
    </footer>
  </article>
</PageShell>
