<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    stripBackendProtocol,
    inferBackendProtocol,
    knownServerSuggestions,
    isLoopbackHost,
  } from "$lib/stores/backendStore";
  import { getRecentValues, recordValue, removeValue } from "$lib/utils/recentValues";
  import { t } from "$lib/i18n";

  export let value: string = "";
  export let id: string | undefined = undefined;
  export let placeholder: string = "localhost:8000";
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let storageKey: string = "backend.url";
  export let extraSuggestions: string[] = knownServerSuggestions();
  let className: string = "";
  export { className as class };

  let hostInput: string = stripBackendProtocol(value || "");
  let lastDispatchedValue: string = value;
  let isOpen = false;
  let forceShowAll = false;
  let highlightedIndex = -1;
  let recentList: string[] = [];

  let inputEl: HTMLInputElement;
  let wrapperEl: HTMLDivElement;
  let dropdownStyle = "";

  const instanceId = Math.random().toString(36).substring(2, 9);
  $: dropdownId = id ? `${id}-backend-listbox` : `backend-listbox-${instanceId}`;

  // Sync external value -> hostInput without creating a reactive cycle
  $: if (value !== lastDispatchedValue) {
    lastDispatchedValue = value;
    hostInput = stripBackendProtocol(value || "");
  }

  // Reactive protocol inferred from hostInput
  $: protocol = inferBackendProtocol(hostInput);

  interface ServerSuggestion {
    host: string;
    label: string;
    isCustom: boolean;
  }

  function getBadgeLabel(host: string): string {
    if (isLoopbackHost(host)) return "Local";
    if (host.toLowerCase().includes("prev")) return "Preview";
    if (host.toLowerCase().includes("api-examance") || host.toLowerCase().includes("prod")) return "Production";
    return "Custom";
  }

  $: allSuggestions = (() => {
    const known = extraSuggestions || knownServerSuggestions();
    const result: ServerSuggestion[] = [];
    const seen = new Set<string>();

    for (const raw of known) {
      const clean = stripBackendProtocol(raw).trim();
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      result.push({
        host: clean,
        label: getBadgeLabel(clean),
        isCustom: false,
      });
    }

    for (const raw of recentList) {
      const clean = stripBackendProtocol(raw).trim();
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      result.push({
        host: clean,
        label: "Custom",
        isCustom: true,
      });
    }

    return result;
  })();

  // Filter suggestions:
  // If forceShowAll is true, OR if hostInput is empty,
  // OR if hostInput exactly matches one of the options (meaning it's the currently selected server):
  // show ALL options so the user can easily switch to any other server!
  $: filteredSuggestions = (() => {
    const query = hostInput.trim().toLowerCase();
    if (forceShowAll || !query) {
      return allSuggestions;
    }
    const isExactMatch = allSuggestions.some((s) => s.host.toLowerCase() === query);
    if (isExactMatch) {
      return allSuggestions;
    }
    return allSuggestions.filter((s) => s.host.toLowerCase().includes(query));
  })();

  function updateDropdownPosition() {
    if (!wrapperEl || typeof window === "undefined") {
      return;
    }

    const rect = wrapperEl.getBoundingClientRect();
    const gap = 4;
    const maxHeight = 260;
    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const openUp = below < Math.min(maxHeight, 160) && above > below;
    const available = Math.max(120, Math.min(maxHeight, openUp ? above : below));

    const width = Math.min(rect.width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    dropdownStyle = openUp
      ? `position: fixed; left: ${left}px; width: ${width}px; bottom: ${window.innerHeight - rect.top + gap}px; max-height: ${available}px; z-index: var(--z-dropdown, 9999);`
      : `position: fixed; left: ${left}px; width: ${width}px; top: ${rect.bottom + gap}px; max-height: ${available}px; z-index: var(--z-dropdown, 9999);`;
  }

  $: if (isOpen) {
    updateDropdownPosition();
  }

  onMount(() => {
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
  });

  let blurTimeout: any;
  onDestroy(() => {
    if (blurTimeout) clearTimeout(blurTimeout);
  });

  function updateValue(newHost: string) {
    const stripped = stripBackendProtocol(newHost);
    hostInput = stripped;
    const trimmed = stripped.trim();
    const newValue = trimmed ? `${inferBackendProtocol(trimmed)}//${trimmed}` : "";
    lastDispatchedValue = newValue;
    value = newValue;
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    let raw = target.value;
    const stripped = stripBackendProtocol(raw);
    if (stripped !== raw) {
      target.value = stripped;
    }
    forceShowAll = false;
    updateValue(stripped);
    isOpen = true;
    highlightedIndex = -1;
  }

  function openDropdown(showAll: boolean = false) {
    if (disabled) return;
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
    forceShowAll = showAll;
    isOpen = true;
    highlightedIndex = -1;
  }

  function closeDropdown() {
    isOpen = false;
    forceShowAll = false;
    highlightedIndex = -1;
  }

  function toggleDropdown() {
    if (disabled) return;
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown(true);
      inputEl?.focus();
    }
  }

  function selectOption(s: ServerSuggestion) {
    updateValue(s.host);
    closeDropdown();
    commit();
    inputEl?.focus();
  }

  function handleRemove(e: MouseEvent, host: string) {
    e.preventDefault();
    e.stopPropagation();
    if (storageKey) {
      recentList = removeValue(storageKey, host);
    }
  }

  function handleFocus() {
    openDropdown(false);
  }

  function handleBlur() {
    blurTimeout = setTimeout(() => {
      closeDropdown();
      commit();
    }, 150);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      openDropdown(true);
      return;
    }
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(
        highlightedIndex + 1,
        filteredSuggestions.length - 1
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
        e.preventDefault();
        selectOption(filteredSuggestions[highlightedIndex]);
      } else {
        closeDropdown();
      }
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  export function commit() {
    if (storageKey && hostInput.trim()) {
      recentList = recordValue(storageKey, hostInput.trim(), 10);
    }
  }
</script>

<svelte:window
  on:resize={() => isOpen && updateDropdownPosition()}
  on:scroll|capture={() => isOpen && updateDropdownPosition()}
/>

<div
  bind:this={wrapperEl}
  class="backend-url-control relative flex items-stretch w-full min-w-0 rounded-md border border-line bg-surface-base transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent {className}"
>
  <span
    class="protocol-prefix inline-flex items-center px-2.5 sm:px-3 text-xs sm:text-sm font-mono font-medium text-slate-400 select-none border-r border-line bg-surface-raised shrink-0"
    title="Protocol: {protocol}//"
    aria-label="Protocol: {protocol}//"
  >
    {protocol}//
  </span>
  <input
    bind:this={inputEl}
    {id}
    type="text"
    autocomplete="off"
    value={hostInput}
    on:input={handleInput}
    on:focus={handleFocus}
    on:blur={handleBlur}
    on:keydown={handleKeydown}
    {placeholder}
    {required}
    {disabled}
    class="backend-url-field flex-1 min-w-0"
    role="combobox"
    aria-expanded={isOpen}
    aria-controls={isOpen ? dropdownId : undefined}
    aria-autocomplete="list"
  />
  <button
    type="button"
    class="dropdown-toggle-btn flex items-center justify-center px-2.5 text-slate-400 hover:text-slate-200 focus:outline-none transition-colors shrink-0"
    on:mousedown|preventDefault={toggleDropdown}
    tabindex="-1"
    aria-label="Toggle server suggestions"
    {disabled}
  >
    <svg
      class="w-3.5 h-3.5 transition-transform duration-200"
      class:rotate-180={isOpen}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clip-rule="evenodd"
      />
    </svg>
  </button>
</div>

{#if isOpen && !disabled}
  <ul
    id={dropdownId}
    class="scroll-pane m-0 list-none overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface-raised p-1 shadow-2xl"
    style={dropdownStyle}
    role="listbox"
  >
    {#if filteredSuggestions.length === 0}
      <li class="px-3 py-2 text-center text-xs italic text-slate-400 select-none">
        {$t("exercises.suggestInput.noEntries")}
      </li>
    {:else}
      {#each filteredSuggestions as suggestion, i}
        {@const isCurrent = suggestion.host.toLowerCase() === hostInput.trim().toLowerCase()}
        <li
          role="option"
          aria-selected={i === highlightedIndex || isCurrent}
          class="group flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors {i === highlightedIndex ? 'bg-sky-600 text-white' : isCurrent ? 'bg-sky-950/60 text-sky-200' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}"
          on:mousedown|preventDefault={() => selectOption(suggestion)}
          on:mouseenter={() => (highlightedIndex = i)}
        >
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="truncate font-mono text-xs sm:text-sm">{suggestion.host}</span>
            {#if isCurrent}
              <span class="text-xs text-sky-400 font-bold shrink-0" title="Selected">✓</span>
            {/if}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span
              class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider {suggestion.label === 'Local' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : suggestion.label === 'Preview' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : suggestion.label === 'Production' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-slate-700/60 text-slate-300 border border-slate-600'}"
            >
              {suggestion.label}
            </span>
            {#if suggestion.isCustom}
              <button
                type="button"
                title={$t("exercises.suggestInput.removeEntry")}
                aria-label={$t("exercises.suggestInput.removeEntry")}
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-slate-400 opacity-60 transition-opacity hover:bg-red-500/30 hover:text-red-300 group-hover:opacity-100"
                on:mousedown|preventDefault|stopPropagation={(e) => handleRemove(e, suggestion.host)}
              >
                ✕
              </button>
            {/if}
          </div>
        </li>
      {/each}
    {/if}
  </ul>
{/if}

<style>
  .protocol-prefix {
    border-top-left-radius: calc(0.375rem - 1px);
    border-bottom-left-radius: calc(0.375rem - 1px);
  }

  .backend-url-control :global(input.backend-url-field) {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    background: transparent !important;
    border-radius: 0 !important;
    margin: 0 !important;
    height: 100% !important;
    padding-top: 0.55rem !important;
    padding-bottom: 0.55rem !important;
    padding-left: 0.75rem !important;
    padding-right: 0.5rem !important;
    color: #f8fafc !important;
    font-size: 1rem !important;
  }

  .backend-url-control :global(input.backend-url-field:focus) {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
  }
</style>
