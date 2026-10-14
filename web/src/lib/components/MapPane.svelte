<script lang="ts">
  // The 3D map in its stage: loads the renderer (and three.js) only when the stage is actually
  // shown, so a phone that opens the list never downloads it.
  import { onMount } from "svelte";
  import { LAYOUTS, type LayoutId } from "#lib/layouts.ts";
  import type { Arrangement } from "#lib/arrange.ts";
  import type { MapView } from "#lib/map/orbit.ts";
  import type { MapData } from "#lib/model.ts";
  import { branchPainted, MARK_COLOR } from "#lib/palette.ts";
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
    layout: LayoutId;
    /** Branch to show, an index into `data.branches`. */
    focus: number | null;
    onselect: (id: string | null) => void;
    /** Called once with the way to measure frames and to find a role on screen, when the map is up. */
    onready?: (tools: Pick<MapView, "benchmark" | "where">) => void;
  }
  let { data, marks, reach, pass, selected, layout, focus, onselect, onready }: Props = $props();

  const indexOf = $derived(new Map(data.roles.map((r, i) => [r.id, i])));
  const info = $derived(LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0]!);
  let arrange = $state.raw<((id: LayoutId) => Arrangement) | null>(null);
  let stage = $state<HTMLDivElement>();
  let view = $state.raw<MapView | null>(null);
  let status = $state<"waiting" | "loading" | "ready" | "unsupported" | "failed">("waiting");
  let hover = $state<{ i: number; x: number; y: number } | null>(null);

  async function start() {
    if (!stage) return;
    status = "loading";
    try {
      const [{ createMap }, { arranger }] = await Promise.all([
        import("#lib/map/orbit.ts"),
        import("#lib/arrange.ts"),
      ]);
      const place = arranger(data);
      const made = createMap(
        stage,
        data,
        {
          onSelect: (i) => onselect(i === null ? null : (data.roles[i]?.id ?? null)),
          onHover: (i, x, y) => (hover = i === null ? null : { i, x, y }),
        },
        place(layout),
      );
      if (!made) {
        status = "unsupported";
        return;
      }
      arrange = place;
      view = made;
      status = "ready";
      onready?.({ benchmark: (frames) => made.benchmark(frames), where: (i) => made.where(i) });
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
  $effect(() => {
    if (arrange) view?.setLayout(arrange(layout));
  });
  $effect(() => view?.focus(focus));

  const hovered = $derived(hover ? data.roles[hover.i] : undefined);
  const percent = (rank: number) => Math.round(rank * 100);
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
        <span>
          {hovered.demands
            ? `fizikai ${percent(hovered.demands[0])} · szellemi ${percent(hovered.demands[1])} · érzelmi ${percent(hovered.demands[2])} (percentilis)`
            : "nincs terhelési adat"}
        </span>
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
      {#each info.key as [channel, meaning] (channel)}
        <li><span>{channel}:</span> {meaning}</li>
      {/each}
      <li><i class="ring"></i> gépi javaslat, nem ellenőrzött</li>
      <li><i class="dot"></i> ellenőrzött</li>
      <li><i class="haze"></i> lágy fény: vezetői szerep</li>
      <li><i class="ghost"></i> halvány szürke pont: nincs terhelési adat</li>
      {#if marks}
        <li><i class="dot" style:background={MARK_COLOR.held}></i> betöltött</li>
        <li><i class="dot" style:background={MARK_COLOR.covered}></i> lefedett</li>
        <li><i class="dot" style:background={MARK_COLOR.reachable}></i> elérhető</li>
      {/if}
    </ul>
    {#if !info.byBranch}
      <ul class="key branches" aria-label="Az ágak színei">
        {#each data.branches as branch, b (branch.id)}
          <li>
            <i class="dot" style:background={branchPainted(b, data.branches.length)}
            ></i>{branch.label}
          </li>
        {/each}
      </ul>
    {/if}
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
  /* Labels in the observatory's hand: monospace capitals, spaced out, on a soft dark halo. */
  .stage :global(.lbl) {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    white-space: nowrap;
    font-family: var(--mono);
    font-size: 0.68rem;
    line-height: 1.2;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--stage-soft);
    text-shadow:
      0 0 6px #000,
      0 0 2px #000;
    will-change: transform, opacity;
  }
  .stage :global(.lbl-branch) {
    width: 10rem;
    white-space: normal;
    text-align: center;
    font-size: 0.7rem;
    line-height: 1.4;
    letter-spacing: 0.14em;
    color: var(--stage-ink);
  }
  .stage :global(.lbl-sub) {
    max-width: 13rem;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
  }
  .stage :global(.lbl-level) {
    font-size: 0.7rem;
    font-weight: 700;
  }
  .stage :global(.lbl-anchor) {
    color: var(--stage-ink);
    font-size: 0.8rem;
    letter-spacing: 0.34em;
  }
  .stage :global(.lbl-shell) {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
  }
  .stage :global(.lbl-state) {
    padding: 0 0.3rem;
    border-radius: 0.2rem;
    background: rgb(11 13 18 / 0.78);
    font-weight: 600;
    letter-spacing: 0.06em;
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
    color: #0b0d12;
    text-shadow: none;
    font-weight: 700;
    letter-spacing: 0.06em;
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
    background: rgb(11 13 18 / 0.94);
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
    background: rgb(11 13 18 / 0.85);
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
  /* A management role: an ordinary point in a wide, faint glow. */
  .key .haze {
    background: radial-gradient(
      circle,
      var(--stage-ink) 0 22%,
      rgb(220 230 247 / 0.32) 36%,
      transparent 70%
    );
    width: 1rem;
    height: 1rem;
    margin: -0.15rem 0.2rem -0.15rem -0.15rem;
  }
  /* A role without demand data: pale and grey. */
  .key .ghost {
    background: color-mix(in srgb, var(--stage-soft) 55%, transparent);
  }
  .key.branches {
    border-top: 0;
    padding-top: 0;
    font-size: 0.75rem;
  }
</style>
