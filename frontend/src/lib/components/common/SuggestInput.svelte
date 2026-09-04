<script lang="ts">
  import { onMount } from "svelte";
  import { getRecentValues, recordValue, removeValue } from "$lib/utils/recentValues";
  import { t } from "$lib/i18n";

  export let storageKey: string = "";
  export let extraSuggestions: string[] = [];
  export let value: string = "";
  export let id: string | undefined = undefined;
  export let placeholder: string = "";
  export let required: boolean = false;
  export let disabled: boolean = false;
  export let autocomplete: string | undefined = undefined;
  let className: string = "";
  export { className as class };
  export let maxSuggestions: number = 15;

  let recentList: string[] = [];
  let inputEl: HTMLInputElement;
  let wrapperEl: HTMLDivElement;
  let isOpen = false;
  let highlightedIndex = -1;

  /* The dropdown is positioned `fixed` against the input's own box rather than
   * absolutely inside the wrapper: several callers (the exercise editor, the
   * exam metadata editor) sit inside `overflow: hidden` / `overflow-y: auto`
   * containers that clipped it away entirely. Fixed positioning escapes those,
   * and the placement flips above the field when there is not enough room
   * below — which is most of the time on a phone in landscape. */
  let dropdownStyle = "";

  function updateDropdownPosition() {
    if (!inputEl || typeof window === "undefined") {
      return;
    }

    const rect = inputEl.getBoundingClientRect();
    const gap = 4;
    const maxHeight = 224; // matches max-h-56
    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const openUp = below < Math.min(maxHeight, 160) && above > below;
    const available = Math.max(120, Math.min(maxHeight, openUp ? above : below));

    // Never let the list hang off the right edge on a narrow screen.
    const width = Math.min(rect.width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    dropdownStyle = openUp
      ? `position: fixed; left: ${left}px; width: ${width}px; bottom: ${window.innerHeight - rect.top + gap}px; max-height: ${available}px; z-index: var(--z-dropdown);`
      : `position: fixed; left: ${left}px; width: ${width}px; top: ${rect.bottom + gap}px; max-height: ${available}px; z-index: var(--z-dropdown);`;
  }

  $: if (isOpen) {
    updateDropdownPosition();
  }

  const instanceId = Math.random().toString(36).substring(2, 9);
  $: dropdownId = id ? `${id}-listbox` : `suggest-listbox-${instanceId}`;

  onMount(() => {
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
  });

  $: allSuggestions = Array.from(
    new Set([...recentList, ...(extraSuggestions || [])])
  ).filter((s) => typeof s === "string" && s.trim().length > 0);

  // Filter suggestions by current input text (case-insensitive), but always
  // show the full list when the field is empty.
  $: filteredSuggestions = value.trim()
    ? allSuggestions.filter((s) =>
        s.toLowerCase().includes(value.trim().toLowerCase())
      )
    : allSuggestions;

  function openDropdown() {
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
    isOpen = true;
    highlightedIndex = -1;
  }

  function closeDropdown() {
    isOpen = false;
    highlightedIndex = -1;
  }

  function selectSuggestion(s: string) {
    value = s;
    closeDropdown();
    commit();
    inputEl?.focus();
  }

  function handleRemove(e: MouseEvent, suggestion: string) {
    e.preventDefault();
    e.stopPropagation();
    if (storageKey) {
      recentList = removeValue(storageKey, suggestion);
    }
    if (highlightedIndex >= filteredSuggestions.length - 1) {
      highlightedIndex = Math.max(0, filteredSuggestions.length - 2);
    }
  }

  function handleFocus() {
    openDropdown();
  }

  function handleBlur() {
    // Delay so a click on a dropdown option registers before we close.
    setTimeout(() => {
      closeDropdown();
      commit();
    }, 120);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      openDropdown();
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
        selectSuggestion(filteredSuggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  export function commit() {
    if (storageKey && value && value.trim()) {
      recentList = recordValue(storageKey, value, maxSuggestions);
    }
  }
</script>

<svelte:window
  on:resize={() => isOpen && updateDropdownPosition()}
  on:scroll|capture={() => isOpen && updateDropdownPosition()}
/>

<div class="relative w-full" bind:this={wrapperEl}>
  <input
    bind:this={inputEl}
    {id}
    type="text"
    autocomplete={autocomplete ?? "off"}
    bind:value
    {placeholder}
    {required}
    {disabled}
    class="w-full {className}"
    on:input
    on:change
    on:focus={handleFocus}
    on:focus
    on:blur={handleBlur}
    on:keydown={handleKeydown}
    on:keydown
    role="combobox"
    aria-expanded={isOpen}
    aria-controls={isOpen ? dropdownId : undefined}
    aria-autocomplete="list"
  />

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
          <li
            role="option"
            aria-selected={i === highlightedIndex}
            class="group flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm text-slate-200 transition-colors {i === highlightedIndex ? 'bg-sky-600 text-white' : 'hover:bg-sky-600/80 hover:text-white'}"
            on:mousedown|preventDefault={() => selectSuggestion(suggestion)}
            on:mouseenter={() => (highlightedIndex = i)}
          >
            <span class="truncate">{suggestion}</span>
            {#if storageKey && recentList.includes(suggestion)}
              <button
                type="button"
                title={$t("exercises.suggestInput.removeEntry")}
                aria-label={$t("exercises.suggestInput.removeEntry")}
                class="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-slate-400 opacity-60 transition-opacity hover:bg-red-500/30 hover:text-red-300 group-hover:opacity-100"
                on:mousedown|preventDefault|stopPropagation={(e) => handleRemove(e, suggestion)}
              >
                ✕
              </button>
            {/if}
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
