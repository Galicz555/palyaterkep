<script lang="ts">
  // The 3D map in its stage: loads the renderer (and three.js) only when the stage is actually
  // shown, so a phone that opens the list never downloads it.
  import { onMount } from "svelte";
  import type { MapView } from "#lib/map/orbit.ts";
  import type { MapData } from "#lib/model.ts";
  import { MARK_COLOR } from "#lib/palette.ts";
  import { capitalise, levelText, trackText } from "#lib/text.ts";

  interface Props {
    data: MapData;
    /** A `Mark` per role, or null without a CV result. */
    marks: Uint8Array | null;
    /** Edges (role indices) the CV reads as steps. */
    reach: [number, number][];
    /** Roles with a 0 are pushed back; null shows all. */
    pass: Uint8Array | null;
    selected: string | null;
    /** Branch to fly to, an index into `data.branches`. */
    focus: number | null;
    onselect: (id: string | null) => void;
    /** Called once with the way to measure frames, when the map is up. */
    onready?: (bench: (frames: number) => ReturnType<MapView["benchmark"]>) => void;
  }
  let { data, marks, reach, pass, selected, focus, onselect, onready }: Props = $props();

  const indexOf = $derived(new Map(data.roles.map((r, i) => [r.id, i])));
  let stage = $state<HTMLDivElement>();
  let view = $state.raw<MapView | null>(null);
  let status = $state<"waiting" | "loading" | "ready" | "unsupported" | "failed">("waiting");
  let hover = $state<{ i: number; x: number; y: number } | null>(null);

  async function start() {
    if (!stage) return;
    status = "loading";
    try {
      const [{ createMap }, { layout }] = await Promise.all([
        import("#lib/map/orbit.ts"),
        import("#lib/layout.ts"),
      ]);
      const made = createMap(stage, data, layout(data), {
        onSelect: (i) => onselect(i === null ? null : (data.roles[i]?.id ?? null)),
        onHover: (i, x, y) => (hover = i === null ? null : { i, x, y }),
      });
      if (!made) {
        status = "unsupported";
        return;
      }
      view = made;
      status = "ready";
      onready?.((frames) => made.benchmark(frames));
    } catch {
      status = "failed";
    }
  }

  onMount(() => {
    // The stage has no size while the list is the visible view: start when it gets one.
    const watcher = new ResizeObserver(() => {
      if (status === "waiting" && stage && stage.clientWidth > 0 && stage.clientHeight > 0)
        void start();
    });
    if (stage) watcher.observe(stage);
    return () => {
      watcher.disconnect();
      view?.destroy();
    };
  });

  $effect(() => view?.setMarks(marks, reach));
  $effect(() => view?.setFilter(pass));
  $effect(() => view?.select(selected === null ? null : (indexOf.get(selected) ?? null)));
  $effect(() => view?.focus(focus));

  const hovered = $derived(hover ? data.roles[hover.i] : undefined);
</script>

<div class="frame">
  <div class="stage" bind:this={stage}>
    {#if status === "loading" || status === "waiting"}
      <p class="note" role="status">A térkép betöltődik…</p>
    {:else if status === "unsupported" || status === "failed"}
      <p class="note" role="alert">
        A 3D térkép ezen az eszközön nem jeleníthető meg. A „Lista” nézet ugyanezt tartalmazza.
      </p>
    {/if}
    {#if hovered && hover}
      <div
        class="tip"
        style:transform="translate3d({Math.min(
          hover.x + 14,
          (stage?.clientWidth ?? 600) - 250,
        )}px,{hover.y + 14}px,0)"
        aria-hidden="true"
      >
        <strong>{capitalise(hovered.label)}</strong>
        <span>{levelText(hovered.level)} · {trackText(hovered.management)}</span>
        <span>{data.branches[hovered.branch]?.subBranches[hovered.sub]?.label}</span>
      </div>
    {/if}
  </div>

  {#if status === "ready"}
    <div class="zoom" role="group" aria-label="Térkép nézet">
      <button type="button" aria-label="Nagyítás" onclick={() => view?.zoomBy(1.6)}>+</button>
      <button type="button" aria-label="Kicsinyítés" onclick={() => view?.zoomBy(1 / 1.6)}>−</button
      >
      <button type="button" aria-label="Az egész térkép" onclick={() => view?.focus(null)}>⌂</button
      >
    </div>
    <ul class="key" aria-label="Jelmagyarázat">
      <li><span>Szög:</span> ág</li>
      <li><span>Távolság:</span> szint, kívül a magasabb</li>
      <li><span>Magasság:</span> pályatípus, a vezetői szerepek fent</li>
      <li><i class="ring"></i> gépi javaslat, nem ellenőrzött</li>
      <li><i class="dot"></i> ellenőrzött</li>
      {#if marks}
        <li><i class="dot" style:background={MARK_COLOR.held}></i> betöltött</li>
        <li><i class="dot" style:background={MARK_COLOR.covered}></i> lefedett</li>
        <li><i class="dot" style:background={MARK_COLOR.reachable}></i> elérhető</li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .frame {
    position: relative;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--stage);
    color: var(--stage-ink);
  }
  .stage {
    position: relative;
    /* Below the page's header, intro and toolbar (about 14rem) and above the key (3rem). */
    height: clamp(26rem, calc(100svh - 17rem), 56rem);
    overflow: hidden;
  }
  .stage :global(.map-canvas) {
    position: absolute;
    inset: 0;
    display: block;
    touch-action: none;
  }
  .stage :global(.map-canvas:focus-visible) {
    outline: 3px solid var(--stage-focus);
    outline-offset: -3px;
  }
  .stage :global(.labels) {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .stage :global(.lbl) {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    white-space: nowrap;
    font-size: 0.72rem;
    line-height: 1.2;
    color: var(--stage-ink);
    text-shadow:
      0 0 3px var(--stage),
      0 0 6px var(--stage);
    will-change: transform, opacity;
  }
  .stage :global(.lbl-branch) {
    width: 8.5rem;
    white-space: normal;
    text-align: center;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .stage :global(.lbl-sub) {
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--stage-soft);
  }
  .stage :global(.lbl-level) {
    color: var(--stage-soft);
    font-size: 0.7rem;
    font-weight: 700;
  }
  .stage :global(.lbl-state) {
    padding: 0 0.3rem;
    border-radius: 0.2rem;
    background: rgb(11 16 32 / 0.78);
    font-weight: 600;
  }
  .stage :global(.lbl-held) {
    color: #ffc247;
  }
  .stage :global(.lbl-covered) {
    color: #5ee0bd;
  }
  .stage :global(.lbl-reach) {
    color: #8fcdf4;
  }
  .stage :global(.lbl-pick) {
    padding: 0.1rem 0.4rem;
    border-radius: 0.25rem;
    background: #fff;
    color: #0b1020;
    text-shadow: none;
    font-weight: 700;
  }
  .stage :global(.mark) {
    position: absolute;
    left: 0;
    top: 0;
    border: 2px solid #fff;
    border-radius: 50%;
  }
  .stage :global(.mark-hover) {
    border-color: rgb(255 255 255 / 0.65);
  }
  .stage :global(.mark-select) {
    box-shadow: 0 0 0 3px rgb(255 255 255 / 0.25);
  }
  .note {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    margin: 0;
    padding: 1rem;
    text-align: center;
    color: var(--stage-soft);
  }
  .tip {
    position: absolute;
    left: 0;
    top: 0;
    display: grid;
    gap: 0.1rem;
    max-width: 15rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--stage-line);
    border-radius: 0.35rem;
    background: rgb(11 16 32 / 0.94);
    font-size: 0.8rem;
    pointer-events: none;
  }
  .tip span {
    color: var(--stage-soft);
  }
  .zoom {
    position: absolute;
    right: 0.6rem;
    top: 0.6rem;
    display: grid;
    gap: 0.3rem;
  }
  .zoom button {
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid var(--stage-line);
    border-radius: 0.4rem;
    background: rgb(11 16 32 / 0.85);
    color: var(--stage-ink);
    font-size: 1.3rem;
    line-height: 1;
  }
  .zoom button:hover {
    border-color: var(--stage-focus);
  }
  .zoom button:focus-visible {
    outline-color: var(--stage-focus);
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.2rem;
    margin: 0;
    padding: 0.5rem 0.8rem;
    list-style: none;
    border-top: 1px solid var(--stage-line);
    font-size: 0.8rem;
    color: var(--stage-soft);
  }
  .key span {
    color: var(--stage-ink);
    font-weight: 600;
  }
  .key i {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    margin-right: 0.3rem;
    border-radius: 50%;
    vertical-align: -0.05rem;
  }
  .key .ring {
    border: 2px solid var(--stage-ink);
  }
  .key .dot {
    background: var(--stage-ink);
  }
</style>
