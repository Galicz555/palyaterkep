<script lang="ts">
  // The 3D map, filling its parent, with the zoom buttons and the legend over it. It loads the
  // renderer (and three.js) only when the stage has a size, so a page that does not show the map
  // never downloads it.
  import { onMount } from "svelte";
  import { LAYOUTS, type LayoutId } from "#lib/layouts.ts";
  import type { Arrangement } from "#lib/arrange.ts";
  import type { MapView } from "#lib/map/orbit.ts";
  import { isReplaceable, type MapData } from "#lib/model.ts";
  import { REPLACEABLE_NOTE } from "#lib/replaceable.svelte.ts";
  import { branchPainted, paintedRgb } from "#lib/palette.ts";
  import { DEMANDS, DEMAND_LINEAR } from "#lib/demand.ts";
  import { capitalise, CHECKED, levelText, trackText, UNCHECKED } from "#lib/text.ts";

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
    /** Which demand lifts the points where a layout does that: an index into `DEMANDS`. */
    axis: number;
    /** Branch to show, an index into `data.branches`. */
    focus: number | null;
    /** The roles the ILO finds strongly replaceable burn out and leave a faint remnant. */
    replaceable: boolean;
    onselect: (id: string | null) => void;
    /** Called once with the ways to measure frames, to find a role on screen and to hide the nodes, when the map is up. */
    onready?: (tools: Pick<MapView, "benchmark" | "where" | "showNodes">) => void;
  }
  let {
    data,
    marks,
    reach,
    pass,
    selected,
    layout,
    axis,
    focus,
    replaceable,
    onselect,
    onready,
  }: Props = $props();

  const indexOf = $derived(new Map(data.roles.map((r, i) => [r.id, i])));
  const info = $derived(LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0]!);
  let arrange = $state.raw<((id: LayoutId, axis: number) => Arrangement) | null>(null);
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
        place(layout, axis),
      );
      if (!made) {
        status = "unsupported";
        return;
      }
      arrange = place;
      view = made;
      status = "ready";
      onready?.({
        benchmark: (frames, blast) => made.benchmark(frames, blast),
        where: (i) => made.where(i),
        showNodes: (on) => made.showNodes(on),
      });
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
    if (arrange) view?.setLayout(arrange(layout, axis));
  });
  $effect(() => view?.focus(focus));
  $effect(() => view?.setReplaceable(replaceable));

  const hovered = $derived(hover ? data.roles[hover.i] : undefined);
  const percent = (rank: number) => Math.round(rank * 100);
</script>

<div class="frame">
  <div class="stage" bind:this={stage}>
    {#if status === "loading" || status === "waiting"}
      <p class="note" role="status">A térkép betöltődik…</p>
    {:else if status === "unsupported" || status === "failed"}
      <p class="note" role="alert">
        A 3D térkép ezen az eszközön nem jeleníthető meg. A <a href="/lista">lista</a> ugyanezt tartalmazza.
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
        <span>{hovered.curated ? CHECKED : UNCHECKED}</span>
        <span>{data.branches[hovered.branch]?.subBranches[hovered.sub]?.label}</span>
        {#if replaceable && isReplaceable(hovered)}
          <span class="replaceable">{REPLACEABLE_NOTE}</span>
        {/if}
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
    <details class="legend">
      <summary>Jelmagyarázat</summary>
      <ul class="key">
        {#each info.key as [channel, meaning] (channel)}
          <li><span>{channel}:</span> {meaning}</li>
        {/each}
        <li><i class="lead"></i> világosabb, nagyobb pont: vezetői szerep</li>
        <li><i class="ghost"></i> halvány szürke pont: nincs terhelési adat</li>
        {#if replaceable}
          <li><i class="ember"></i> halvány gyűrű: erősen kiváltható szerep (ILO, 4. gradiens)</li>
        {/if}
        {#if marks}
          <li><i class="star held"></i> betöltött: fehér, a legnagyobb, négy sugárral</li>
          <li><i class="star covered"></i> lefedett: fehér, kisebb</li>
          <li><i class="star reachable"></i> elérhető: fehér, a legkisebb</li>
        {/if}
      </ul>
      {#if info.demandColors}
        <ul class="key branches" aria-label="A terhelések színei">
          {#each DEMANDS as demand, k (demand.key)}
            <li>
              <i class="dot" style:background={paintedRgb(DEMAND_LINEAR[k]!)}></i>{demand.label}
            </li>
          {/each}
          {#if layout === "K"}
            <li>
              <svg class="glyph" viewBox="-12 -12 24 24" aria-hidden="true">
                {#each DEMANDS as demand, k (demand.key)}
                  <line
                    x1="0"
                    y1="0"
                    x2={[-9, 0, 9][k]}
                    y2={[5, -10, 5][k]}
                    stroke={paintedRgb(DEMAND_LINEAR[k]!)}
                    stroke-width="2.4"
                    stroke-linecap="round"
                  />
                {/each}
              </svg>
              egy szerep: a kar hossza a terhelés
            </li>
          {/if}
        </ul>
      {:else if !info.byBranch}
        <ul class="key branches" aria-label="Az ágak színei">
          {#each data.branches as branch, b (branch.id)}
            <li>
              <i class="dot" style:background={branchPainted(b)}></i>{branch.label}
            </li>
          {/each}
        </ul>
      {/if}
    </details>
  {/if}
</div>

<style>
  .frame {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--stage);
    color: var(--stage-ink);
  }
  .stage {
    position: relative;
    height: 100%;
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
  .stage :global(.lbl-held),
  .stage :global(.lbl-covered),
  .stage :global(.lbl-reach) {
    color: #fff;
  }
  .stage :global(.lbl-held) {
    font-weight: 700;
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
  .tip .replaceable {
    color: #ffb27a;
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
  .legend {
    position: absolute;
    left: 0.6rem;
    bottom: 0.6rem;
    box-sizing: border-box;
    width: min(24rem, calc(100% - 1.2rem));
    max-height: calc(100% - 8rem);
    overflow: auto;
    border: 1px solid var(--stage-line);
    border-radius: 0.4rem;
    background: rgb(11 13 18 / 0.88);
    font-size: 0.8rem;
    color: var(--stage-soft);
  }
  .legend summary {
    min-height: 2.75rem;
    padding: 0 0.8rem;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--stage-ink);
    font-weight: 600;
  }
  .legend summary:focus-visible {
    outline-color: var(--stage-focus);
    outline-offset: -3px;
  }
  .key {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0.1rem 0.8rem 0.6rem;
    list-style: none;
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
  .key .dot {
    background: var(--stage-ink);
  }
  /* A management role: the same point, brighter and a little larger, no glow. */
  .key .lead {
    background: #fff;
    width: 0.8rem;
    height: 0.8rem;
    margin-left: -0.05rem;
  }
  /* The three white states, told apart by size, and spikes on the held one. */
  .key .star {
    position: relative;
    background: #fff;
  }
  .key .star.held {
    width: 0.8rem;
    height: 0.8rem;
  }
  .key .star.held::before,
  .key .star.held::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    background: #fff;
  }
  .key .star.held::before {
    width: 1.5rem;
    height: 1px;
    transform: translate(-50%, -50%);
  }
  .key .star.held::after {
    width: 1px;
    height: 1.5rem;
    transform: translate(-50%, -50%);
  }
  .key .star.covered {
    width: 0.6rem;
    height: 0.6rem;
  }
  .key .star.reachable {
    width: 0.4rem;
    height: 0.4rem;
    opacity: 0.85;
  }
  /* A role without demand data: pale and grey. */
  .key .ghost {
    background: color-mix(in srgb, var(--stage-soft) 55%, transparent);
  }
  /* What a blast leaves: a faint star in a thin warm ring. */
  .key .ember {
    background: color-mix(in srgb, #9f6b57 55%, transparent);
    box-shadow: 0 0 0 2px var(--stage-line) inset;
    outline: 1px solid #ff8a5c;
    outline-offset: 1px;
  }
  .key .glyph {
    width: 1.1rem;
    height: 1.1rem;
    vertical-align: middle;
    margin-right: 0.2rem;
  }
  .key.branches {
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    padding-top: 0;
    border-top: 1px solid var(--stage-line);
    padding-top: 0.6rem;
    font-size: 0.75rem;
  }
</style>
