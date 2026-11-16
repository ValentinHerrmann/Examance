<script lang="ts">
  import { pictogramPage, type SheetSketchModel, type SketchPageRole, type SketchPart } from "#lib/exam/sheetSketch";
  import SketchPage from "./SketchPage.svelte";

  /** A tiny page of a sketch model for a setting tile (issue #272): the case the tile stands for, its element stressed. */
  interface Props {
    model: SheetSketchModel;
    page: SketchPageRole | "sticker";
    part?: SketchPart | null;
  }

  let { model, page, part = null }: Props = $props();
</script>

<SketchPage {model} page={pictogramPage(model, page)} highlight={part} class="w-12" />
