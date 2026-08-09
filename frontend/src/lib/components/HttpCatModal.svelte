<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { httpErrorStore } from "$lib/stores/httpErrorStore";
  import "./HttpCatModal.css";

  let isLoading = true;
  let hasImageError = false;

  $: status = $httpErrorStore.status;
  $: imageUrl = `https://http.cat/${status}`;

  $: if ($httpErrorStore.isOpen) {
    isLoading = true;
    hasImageError = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && $httpErrorStore.isOpen) {
      httpErrorStore.closeError();
    }
  }

  function handleImageLoad() {
    isLoading = false;
  }

  function handleImageError() {
    isLoading = false;
    hasImageError = true;
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

      <div class="http-cat-header">
      </div>

      <div class="http-cat-image-container">
        {#if isLoading}
          <div class="http-cat-spinner-container">
            <div class="http-cat-spinner"></div>
            <p>Loading cat image...</p>
          </div>
        {/if}

        {#if !hasImageError}
          <img
            src={imageUrl}
            alt="HTTP {status} Cat Error"
            class="http-cat-img"
            class:hidden={isLoading}
            on:load={handleImageLoad}
            on:error={handleImageError}
          />
        {:else}
          <div class="http-cat-fallback">
            <div class="http-cat-badge">{status}</div>
            <p>Could not load cat image from http.cat</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
