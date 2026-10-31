<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";
  import Icon from "./Icon.svelte";

  /** Centred dialog with an icon badge, for a moment that deserves more than a plain confirm. */
  interface Action {
    label: string;
    onClick?: () => void;
    href?: string;
  }

  interface Props {
    open: boolean;
    icon: IconDefinition;
    tone: "danger" | "info";
    title: string;
    body: string;
    /** Solid button, coloured by `tone`. */
    primary: Action;
    /** Outlined button; also what closing the dialog does. */
    secondary: Action;
  }

  let { open, icon, tone, title, body, primary, secondary }: Props = $props();

  const badge = { danger: "bg-danger/20 text-danger-fg", info: "bg-info/20 text-info-fg" };
</script>

<Modal {open} size="small" onClose={secondary.onClick} bare>
  <div class="flex flex-col items-center gap-4 p-8 text-center">
    <div class="flex size-14 items-center justify-center rounded-full text-2xl {badge[tone]}">
      <Icon {icon} />
    </div>
    <h3 class="m-0 text-xl font-semibold text-content">{title}</h3>
    <p class="m-0 text-sm text-muted">{body}</p>
    <div class="mt-2 flex w-full flex-col gap-2">
      <Button severity={tone === "danger" ? "danger" : "primary"} block href={primary.href} onClick={primary.onClick}>
        {primary.label}
      </Button>
      <Button variant="outlined" severity="secondary" block href={secondary.href} onClick={secondary.onClick}>
        {secondary.label}
      </Button>
    </div>
  </div>
</Modal>
