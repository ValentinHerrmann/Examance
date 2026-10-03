<script lang="ts">
  import { faArrowRight, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { openHelp } from "#lib/stores/helpStore";
  import type { HelpTopicId } from "#lib/help/topics";
  import { Button, Popover } from "#lib/components/ui";

  /** Micro-help for one control where `Field`'s `hint` cannot be used. Opens on click and hover (touch has no hover). */
  interface Props {
    text: string;
    /** When set, the popover offers a link into the full help topic. */
    topic?: HelpTopicId | undefined;
    class?: string;
  }

  let { text, topic = undefined, class: className = "" }: Props = $props();

  let open = $state(false);
  let wrapper: HTMLElement | undefined = $state();
  const id = `infotip-${Math.random().toString(36).slice(2, 9)}`;

  function close() {
    open = false;
  }

  function onFocusOut(event: FocusEvent) {
    if (!wrapper?.contains(event.relatedTarget as Node | null)) close();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  bind:this={wrapper}
  class="inline-flex {className}"
  onmouseenter={() => (open = true)}
  onmouseleave={close}
  onfocusout={onFocusOut}
>
  <Popover bind:open panelClass="w-64 max-w-[calc(100vw-1rem)] p-3 text-sm font-normal text-muted sm:w-72">
    {#snippet trigger()}
        <Button
          variant="text"
          severity="secondary"
          size="sm"
          iconOnly
          icon={faCircleInfo}
          ariaLabel={$t("help.ui.showTip")}
          class="size-6! text-sm pointer-coarse:size-11!"
          aria-expanded={open}
          aria-describedby={open ? id : undefined}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            open = !open;
          }}
        />
    {/snippet}
    <span {id} role="tooltip" class="block">
      {text}
      {#if topic}
        <Button
          variant="text"
          size="sm"
          class="mt-1.5 min-h-0! p-0!"
          iconRight={faArrowRight}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            close();
            if (topic) openHelp(topic);
          }}
        >
          {$t("help.ui.moreInfo")}
        </Button>
      {/if}
    </span>
  </Popover>
</span>
