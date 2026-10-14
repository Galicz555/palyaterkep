<script lang="ts">
  // The map and nothing else: it has the whole screen, with a layout choice, the zoom buttons,
  // a legend and, for a picked role, a small card over it. The list, the CV and the long text have
  // their own pages (/lista, /oneletrajz).
  import { replaceState } from "$app/navigation";
  import { onMount } from "svelte";
  import MapPane from "#lib/components/MapPane.svelte";
  import RolePanel from "#lib/components/RolePanel.svelte";
  import { cv } from "#lib/cv.svelte.ts";
  import { countStates } from "#lib/cv.ts";
  import { AXES, axisOf, DEFAULT_LAYOUT, LAYOUTS, layoutOf, type LayoutId } from "#lib/layouts.ts";
  import { DEMANDS } from "#lib/demand.ts";
  import { MARK } from "#lib/palette.ts";
  import { capitalise } from "#lib/text.ts";

  let { data } = $props();
  const map = $derived(data.map);
  const indexOf = $derived(new Map(map.roles.map((r, i) => [r.id, i])));

  // A narrow screen gets a choice first, the list or the map: three thousand specks on a phone
  // are for people who ask, and the renderer is a download the list does not need.
  let show = $state<"pending" | "map" | "gate">("pending");

  let branch = $state<number | null>(null);
  let selected = $state<string | null>(null);
  // Layout: which arrangement of the map; it lives in the address, so a link reproduces it.
  let layout = $state<LayoutId>(DEFAULT_LAYOUT);
  // Axis: the demand that lifts the points in layout B.
  let axis = $state(0);
  function toAddress(name: string, value: string | null) {
    const url = new URL(location.href);
    if (value === null) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    replaceState(url, {});
  }
  function chooseLayout(next: LayoutId) {
    layout = next;
    toAddress("elrendezes", next);
  }
  function chooseAxis(next: number) {
    axis = next;
    toAddress("tengely", AXES[next]!);
  }
  function clearBranch() {
    branch = null;
    toAddress("ag", null);
  }

  // A link from a role page names the branch to show and the role to pick.
  const pass = $derived.by(() => {
    if (branch === null) return null;
    return Uint8Array.from(map.roles, (r) => (r.branch === branch ? 1 : 0));
  });

  // What the CV says, as the map wants it: marks, steps.
  const marks = $derived.by(() => {
    if (!cv.view) return null;
    const out = new Uint8Array(map.roles.length);
    for (const [id, state] of cv.view.states) {
      const i = indexOf.get(id);
      if (i !== undefined) out[i] = MARK[state.kind];
    }
    return out;
  });
  const reach = $derived.by(() => {
    const out: [number, number][] = [];
    for (const [id, state] of cv.view?.states ?? []) {
      const to = indexOf.get(id);
      const from = state.kind === "reachable" ? indexOf.get(state.from) : undefined;
      if (to !== undefined && from !== undefined) out.push([from, to]);
    }
    return out;
  });
  const counts = $derived(cv.view ? countStates(cv.view.states, (id) => indexOf.has(id)) : null);

  // The branch the result is mostly in, so the camera shows it rather than the whole map's specks.
  const resultBranch = $derived.by(() => {
    const tally = new Map<number, number>();
    for (const [id, state] of cv.view?.states ?? []) {
      const i = indexOf.get(id);
      if (i === undefined) continue;
      const b = map.roles[i]!.branch;
      tally.set(b, (tally.get(b) ?? 0) + (state.kind === "held" ? 100 : 1));
    }
    return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  });

  const role = $derived(selected === null ? undefined : map.roles[indexOf.get(selected) ?? -1]);
  const roleState = $derived(role ? cv.view?.states.get(role.id) : undefined);
  const fromRole = $derived(
    roleState?.kind === "reachable" ? map.roles[indexOf.get(roleState.from) ?? -1] : undefined,
  );

  onMount(() => {
    const params = new URLSearchParams(location.search);
    const ag = map.branches.findIndex((b) => b.id === params.get("ag"));
    if (ag >= 0) branch = ag;
    layout = layoutOf(params.get("elrendezes"));
    axis = axisOf(params.get("tengely"));
    const szerep = params.get("szerep");
    if (szerep && indexOf.has(szerep)) selected = szerep;
    // A link to a role on the map is a request for the map, on any screen.
    show = matchMedia("(min-width: 60rem)").matches || selected !== null ? "map" : "gate";
  });

  function onready(tools: {
    benchmark: (frames: number) => Promise<unknown>;
    where: (i: number) => unknown;
    showNodes: (on: boolean) => void;
  }) {
    // Frame timings and roles' places on screen for the measurement script: ?teljesitmeny on the
    // address.
    if (new URLSearchParams(location.search).has("teljesitmeny")) {
      const hooks = globalThis as Record<string, unknown>;
      hooks["__terkepBenchmark"] = tools.benchmark;
      hooks["__terkepWhere"] = (id: string) => tools.where(indexOf.get(id) ?? -1);
      hooks["__terkepNodes"] = tools.showNodes;
    }
  }
</script>

<svelte:head>
  <title>Pályatérkép: szerepek, szintek, hiányzó készségek</title>
  <meta
    name="description"
    content="Magyar pályák térképe: minden szerep a szakterülete, a szintje és a pályatípusa szerint, és hogy mi kell hozzá."
  />
</svelte:head>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && selected !== null) selected = null;
  }}
/>

<main id="tartalom" class="screen">
  <h1 class="sr-only">Szerepek térképe</h1>

  {#if show === "map"}
    <MapPane
      data={map}
      {marks}
      {reach}
      {pass}
      {selected}
      {layout}
      {axis}
      focus={branch ?? resultBranch}
      onselect={(id) => (selected = id)}
      {onready}
    />

    <div class="controls">
      <label class="select">
        <span>Elrendezés</span>
        <select value={layout} onchange={(e) => chooseLayout(layoutOf(e.currentTarget.value))}>
          {#each LAYOUTS as l (l.id)}
            <option value={l.id}>{l.label}</option>
          {/each}
        </select>
      </label>
      {#if layout === "B"}
        <div class="axis" role="group" aria-label="A magasságot adó terhelés">
          <span>Magasság</span>
          <div>
            {#each DEMANDS as d, k (d.key)}
              <button type="button" aria-pressed={axis === k} onclick={() => chooseAxis(k)}>
                {d.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      {#if branch !== null}
        <p class="chip">
          {map.branches[branch]?.label}
          <button type="button" onclick={clearBranch} aria-label="Az ág szűrésének megszüntetése">
            ×
          </button>
        </p>
      {/if}
      {#if counts}
        <p class="chip">
          <a href="/oneletrajz">
            Önéletrajz: {counts.held} betöltött · {counts.covered} lefedett · {counts.reachable} elérhető
          </a>
        </p>
      {/if}
    </div>

    <aside class="card" aria-label="A kijelölt szerep" aria-live="polite">
      {#if role}
        <RolePanel
          {role}
          path="{map.branches[role.branch]?.label} › {map.branches[role.branch]?.subBranches[
            role.sub
          ]?.label}"
          state={roleState}
          fromLabel={fromRole ? capitalise(fromRole.label) : undefined}
          onclose={() => (selected = null)}
        />
      {/if}
    </aside>
  {:else if show === "gate"}
    <div class="gate">
      <p>
        A 3D térkép nagy képernyőn a legjobb. Telefonon a lista könnyebben használható, és ugyanezt
        tartalmazza.
      </p>
      <p class="gate-actions">
        <a class="button primary" href="/lista">Szerepek listája</a>
        <button type="button" class="button" onclick={() => (show = "map")}>
          Térkép megnyitása
        </button>
      </p>
    </div>
  {:else}
    <p class="loading" role="status">A térkép betöltődik…</p>
  {/if}
</main>

<style>
  .screen {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: var(--stage);
    color: var(--stage-ink);
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    margin: 0;
    color: var(--stage-soft);
  }

  /* Over the map, under the nav panel at the top left. */
  .controls {
    position: absolute;
    left: 0.6rem;
    top: 4.1rem;
    z-index: 4;
    display: grid;
    justify-items: start;
    gap: 0.4rem;
    max-width: calc(100% - 4.6rem);
  }
  .select,
  .axis,
  .chip {
    margin: 0;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--stage-line);
    border-radius: 0.4rem;
    background: rgb(11 13 18 / 0.88);
    font-size: 0.85rem;
  }
  .select {
    display: grid;
    gap: 0.1rem;
    color: var(--stage-soft);
  }
  .select select {
    min-height: 2.75rem;
    max-width: 100%;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--stage-soft);
    border-radius: 0.3rem;
    background: var(--stage);
    color: var(--stage-ink);
    font-size: 0.95rem;
  }
  .axis {
    display: grid;
    gap: 0.2rem;
    color: var(--stage-soft);
  }
  .axis div {
    display: flex;
    gap: 0.3rem;
  }
  .axis button,
  .chip button {
    min-height: 2.75rem;
    padding: 0 0.7rem;
    border: 1px solid var(--stage-line);
    border-radius: 0.3rem;
    background: transparent;
    color: var(--stage-ink);
  }
  .axis button[aria-pressed="true"] {
    background: var(--stage-ink);
    border-color: var(--stage-ink);
    color: var(--stage);
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--stage-ink);
  }
  .chip a {
    color: var(--stage-ink);
  }
  .chip button {
    min-width: 2.75rem;
    padding: 0;
    font-size: 1.3rem;
    line-height: 1;
  }
  /* The nav panel wraps to a second line on a narrow screen. */
  @media (max-width: 40rem) {
    .controls {
      top: 7.2rem;
    }
  }
  .controls :focus-visible {
    outline-color: var(--stage-focus);
  }

  /* The picked role: a card in the corner, scrolling if the role has a lot to say. */
  .card {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    z-index: 4;
    width: min(22rem, calc(100% - 1.2rem));
    max-height: calc(100% - 8rem);
    overflow: auto;
    color: var(--ink);
  }

  .gate {
    position: absolute;
    inset: 0;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 1rem;
    padding: 5rem 1.5rem 2rem;
    text-align: center;
  }
  .gate p {
    max-width: 28rem;
    margin: 0;
  }
  .gate-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6rem;
  }
  .gate .button {
    background: var(--stage);
    border-color: var(--stage-soft);
    color: var(--stage-ink);
  }
  .gate .button.primary {
    background: var(--stage-ink);
    color: var(--stage);
  }
  .gate :focus-visible {
    outline-color: var(--stage-focus);
  }
</style>
