<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { getRecentValues, recordValue, removeValue } from "#lib/utils/recentValues";
  import { t } from "#lib/i18n";
  import { faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Icon } from "#lib/components/ui";

  interface Props {
    storageKey?: string;
    extraSuggestions?: string[];
    value?: string;
    id?: string | undefined;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    autocomplete?: HTMLInputAttributes["autocomplete"];
    class?: string;
    maxSuggestions?: number;
    oninput?: HTMLInputAttributes["oninput"];
    onchange?: HTMLInputAttributes["onchange"];
    onfocus?: HTMLInputAttributes["onfocus"];
    onblur?: HTMLInputAttributes["onblur"];
    onkeydown?: HTMLInputAttributes["onkeydown"];
  }

  let {
    storageKey = "",
    extraSuggestions = [],
    value = $bindable(""),
    id = undefined,
    placeholder = "",
    required = false,
    disabled = false,
    autocomplete = undefined,
    class: className = "",
    maxSuggestions = 15,
    oninput = undefined,
    onchange = undefined,
    onfocus = undefined,
    onblur = undefined,
    onkeydown = undefined,
  }: Props = $props();

  let recentList: string[] = $state([]);
  let inputEl: HTMLInputElement | undefined = $state();
  let wrapperEl: HTMLDivElement | undefined = $state();
  let isOpen = $state(false);
  let highlightedIndex = $state(-1);

  // `fixed` against the input's box: callers sit in overflow-hidden/auto containers that clipped an absolute list.
  // Flips above the field when there is no room below (phone in landscape).
  let dropdownStyle = $state("");

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

  const instanceId = Math.random().toString(36).substring(2, 9);
  let dropdownId = $derived(id ? `${id}-listbox` : `suggest-listbox-${instanceId}`);

  onMount(() => {
    if (storageKey) {
      recentList = getRecentValues(storageKey);
    }
  });

  let allSuggestions = $derived(Array.from(
    new Set([...recentList, ...(extraSuggestions || [])])
  ).filter((s) => typeof s === "string" && s.trim().length > 0));

  // Case-insensitive filter by current text; the full list when the field is empty.
  let filteredSuggestions = $derived(value.trim()
    ? allSuggestions.filter((s) =>
        s.toLowerCase().includes(value.trim().toLowerCase())
      )
    : allSuggestions);

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

  // Sync the bound value before the caller's handler runs, so it never sees a stale `value`.
  function handleInput(e: Parameters<NonNullable<typeof oninput>>[0]) {
    value = e.currentTarget.value;
    oninput?.(e);
  }

  function handleFocus(e: Parameters<NonNullable<typeof onfocus>>[0]) {
    openDropdown();
    onfocus?.(e);
  }

  function handleBlur(e: Parameters<NonNullable<typeof onblur>>[0]) {
    // Delay so a click on a dropdown option registers before we close.
    setTimeout(() => {
      closeDropdown();
      commit();
    }, 120);
    onblur?.(e);
  }

  function handleKeydown(e: Parameters<NonNullable<typeof onkeydown>>[0]) {
    navigate(e);
    onkeydown?.(e);
  }

  function navigate(e: KeyboardEvent) {
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

  $effect.pre(() => {
    if (isOpen) {
      untrack(() => updateDropdownPosition());
    }
  });
</script>

<svelte:window
  onresize={() => isOpen && updateDropdownPosition()}
  onscrollcapture={() => isOpen && updateDropdownPosition()}
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
    oninput={handleInput}
    {onchange}
    onfocus={handleFocus}
    onblur={handleBlur}
    onkeydown={handleKeydown}
    role="combobox"
    aria-expanded={isOpen}
    aria-controls={isOpen ? dropdownId : undefined}
    aria-autocomplete="list"
  />

  {#if isOpen && !disabled}
    <ul
      id={dropdownId}
      class="scroll-pane m-0 list-none overflow-y-auto overscroll-contain rounded-md border border-line bg-surface-raised p-1 shadow-md"
      style={dropdownStyle}
      role="listbox"
    >
      {#if filteredSuggestions.length === 0}
        <li class="px-3 py-2 text-center text-xs italic text-muted select-none">
          {$t("exercises.suggestInput.noEntries")}
        </li>
      {:else}
        {#each filteredSuggestions as suggestion, i}
          <li
            role="option"
            aria-selected={i === highlightedIndex}
            class="group flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm text-content transition-colors {i === highlightedIndex ? 'bg-primary text-primary-contrast' : 'hover:bg-primary/80 hover:text-primary-contrast'}"
            onmousedown={(e) => {
              e.preventDefault();
              selectSuggestion(suggestion);
            }}
            onmouseenter={() => (highlightedIndex = i)}
          >
            <span class="truncate">{suggestion}</span>
            {#if storageKey && recentList.includes(suggestion)}
              <button
                type="button"
                title={$t("exercises.suggestInput.removeEntry")}
                aria-label={$t("exercises.suggestInput.removeEntry")}
                class="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs text-muted opacity-60 transition-opacity hover:bg-danger/30 hover:text-danger-fg group-hover:opacity-100"
                onmousedown={(e) => handleRemove(e, suggestion)}
              >
                <Icon icon={faXmark} />
              </button>
            {/if}
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
