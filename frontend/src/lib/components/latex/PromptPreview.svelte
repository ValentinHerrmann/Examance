<script lang="ts">
  /**
   * Read-only, highlighted view of an AI-chat prompt (issue #168): Markdown marks plus LaTeX in `latex` code blocks.
   * Shows the exact text that is copied; never rendered as HTML, since the prompt holds exercise code and logs.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { Compartment, EditorState } from "@codemirror/state";
  import { syntaxHighlighting } from "@codemirror/language";
  import { markdown } from "@codemirror/lang-markdown";
  import { theme } from "#lib/stores/theme";
  import { createLatexTheme, latexHighlightStyle, latexLanguage, markdownHighlightStyle } from "../LatexEditor";

  interface Props {
    text: string;
    class?: string;
  }

  let { text, class: className = "" }: Props = $props();

  let container: HTMLDivElement;
  let view = $state.raw<EditorView | null>(null);
  const themeCompartment = new Compartment();

  onMount(() => {
    view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: text,
        extensions: [
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          markdown({ codeLanguages: (info) => (info === "latex" ? latexLanguage : null) }),
          syntaxHighlighting(markdownHighlightStyle),
          syntaxHighlighting(latexHighlightStyle),
          themeCompartment.of(createLatexTheme($theme === "dark")),
          EditorView.theme({ "&": { fontSize: "0.75rem" }, ".cm-content": { padding: "8px 12px" } }),
        ],
      }),
    });
  });

  onDestroy(() => view?.destroy());

  $effect.pre(() => {
    const v = view;
    const next = text;
    if (!v) return;
    untrack(() => {
      const current = v.state.doc.toString();
      if (current !== next) v.dispatch({ changes: { from: 0, to: current.length, insert: next } });
    });
  });

  $effect.pre(() => {
    const v = view;
    const dark = $theme === "dark";
    if (!v) return;
    untrack(() => v.dispatch({ effects: themeCompartment.reconfigure(createLatexTheme(dark)) }));
  });
</script>

<div bind:this={container} class="flex min-h-0 overflow-hidden {className}"></div>
