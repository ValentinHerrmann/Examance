<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { httpErrorStore } from "$lib/stores/httpErrorStore";
  import "./HttpCatModal.css";

  // This modal used to render an image from the http.cat service, which
  // disclosed the user's IP, User-Agent and the failing status code to a third
  // party on every API error — in an app whose compliance documents state the
  // browser contacts no external host. The artwork is not licensed for
  // redistribution, so self-hosting it was not an option; the status is
  // rendered as text instead. See docs/legal_audit_dsgvo.md, finding L16.

  $: status = $httpErrorStore.status;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && $httpErrorStore.isOpen) {
      httpErrorStore.closeError();
    }
  }

  onMount(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeydown);
    }
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", handleKeydown);
    }
  });

  const statusTitles: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    408: "Request Timeout",
    409: "Conflict",
    418: "I'm a teapot",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };

  $: statusText = statusTitles[status] || "HTTP Error";
</script>

{#if $httpErrorStore.isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="http-cat-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="http-cat-title"
    on:click|self={() => httpErrorStore.closeError()}
  >
    <div class="http-cat-modal">
      <button
        type="button"
        class="http-cat-close-btn"
        aria-label="Close"
        on:click={() => httpErrorStore.closeError()}
      >
        ✕
      </button>

      <div class="http-cat-header" id="http-cat-title">
        {statusText}
      </div>

      <div class="http-cat-image-container">
        <div class="http-cat-fallback">
          <div class="http-cat-badge">{status}</div>
        </div>
      </div>
    </div>
  </div>
{/if}
