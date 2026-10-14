<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { onMount, tick } from "svelte";
  import CvUpload from "#lib/components/CvUpload.svelte";
  import MapPane from "#lib/components/MapPane.svelte";
  import RoleList from "#lib/components/RoleList.svelte";
  import RolePanel from "#lib/components/RolePanel.svelte";
  import { cv } from "#lib/cv.svelte.ts";
  import { DEFAULT_LAYOUT, LAYOUTS, layoutOf, type LayoutId } from "#lib/layouts.ts";
  import { MARK } from "#lib/palette.ts";
  import { capitalise, fold } from "#lib/text.ts";

  let { data } = $props();
  const map = $derived(data.map);
  const indexOf = $derived(new Map(map.roles.map((r, i) => [r.id, i])));
  const folded = $derived(map.roles.map((r) => fold(r.label)));

  // View: the CSS picks map or list by width until the person chooses (data-view="auto").
  type Mode = "auto" | "map" | "list";
  let mode = $state<Mode>("auto");
  let wide = $state(false);
  const view = $derived(mode === "auto" ? (wide ? "map" : "list") : mode);

  // Search (debounced: typing should not repaint three thousand nodes per key) and branch.
  let typed = $state("");
  let query = $state("");
  let branch = $state<number | null>(null);
  let selected = $state<string | null>(null);
  // Layout: which arrangement of the map; it lives in the address, so a link reproduces it.
  let layout = $state<LayoutId>(DEFAULT_LAYOUT);
  const layoutInfo = $derived(LAYOUTS.find((l) => l.id === layout) ?? LAYOUTS[0]!);
  function chooseLayout(next: LayoutId) {
    layout = next;
    const url = new URL(location.href);
    url.searchParams.set("elrendezes", next);
    replaceState(url, {});
  }
  $effect(() => {
    const text = typed;
    const timer = setTimeout(() => (query = text), 150);
    return () => clearTimeout(timer);
  });

  const needle = $derived(fold(query.trim()));
  const pass = $derived.by(() => {
    if (!needle && branch === null) return null;
    const out = new Uint8Array(map.roles.length);
    map.roles.forEach((r, i) => {
      if ((branch === null || r.branch === branch) && folded[i]?.includes(needle)) out[i] = 1;
    });
    return out;
  });
  const matches = $derived(pass ? pass.reduce((n, v) => n + v, 0) : map.roles.length);

  // What the CV says, as the map wants it (marks and steps) and the list wants it (by id).
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
  const counts = $derived.by(() => {
    const out = { held: 0, covered: 0, reachable: 0, unknown: 0 };
    for (const [id, state] of cv.view?.states ?? []) {
      if (indexOf.has(id)) out[state.kind] += 1;
      else out.unknown += 1;
    }
    return out;
  });

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
    const nezet = params.get("nezet");
    if (nezet === "map" || nezet === "list") mode = nezet;
    layout = layoutOf(params.get("elrendezes"));
    const szerep = params.get("szerep");
    if (szerep && indexOf.has(szerep)) selected = szerep;

    const wideQuery = matchMedia("(min-width: 60rem)");
    wide = wideQuery.matches;
    const onChange = () => (wide = wideQuery.matches);
    wideQuery.addEventListener("change", onChange);
    return () => wideQuery.removeEventListener("change", onChange);
  });

  function onready(tools: {
    benchmark: (frames: number) => Promise<unknown>;
    where: (i: number) => unknown;
  }) {
    // Frame timings and roles' places on screen for the measurement script: ?teljesitmeny on the
    // address.
    if (new URLSearchParams(location.search).has("teljesitmeny")) {
      const hooks = globalThis as Record<string, unknown>;
      hooks["__terkepBenchmark"] = tools.benchmark;
      hooks["__terkepWhere"] = (id: string) => tools.where(indexOf.get(id) ?? -1);
    }
  }

  /** A result replaces the upload form, so focus goes to the summary that is on screen. */
  async function focusSummary() {
    await tick();
    const shown = [...document.querySelectorAll<HTMLElement>(".summary")];
    shown.find((el) => el.offsetParent !== null)?.focus();
  }

  /** Clearing brings the upload form back; focus follows it. */
  async function clearResult() {
    cv.clear();
    await tick();
    document.getElementById("cv-upload-title")?.focus();
  }

  function showCvList() {
    mode = "list";
    queueMicrotask(() => document.getElementById("cv-list")?.scrollIntoView());
  }
</script>

<svelte:head>
  <title>Pályatérkép: szerepek, szintek, hiányzó készségek</title>
  <meta
    name="description"
    content="Magyar pályák térképe: minden szerep a szakterülete, a szintje és a pályatípusa szerint, és hogy mi kell hozzá."
  />
</svelte:head>

<main id="tartalom" class="page" data-view={mode === "auto" ? "auto" : view}>
  <header class="intro">
    <h1>Szerepek térképe</h1>
    <p>
      {layoutInfo.intro}
      {#if !cv.view}Az önéletrajzod beolvasása után itt látszik, melyiket töltötted be, melyiket
        fedik le a készségeid, és melyik van egy lépésre, a hiányzó készségekkel.{/if}
    </p>
  </header>

  {#if !cv.view}
    <CvUpload maxChars={data.maxChars} ondone={focusSummary} />
  {/if}

  {#snippet summary(withListButton: boolean)}
    <section class="summary" aria-label="Az önéletrajz eredménye" tabindex="-1">
      <p>
        <strong>{counts.held}</strong> betöltött, <strong>{counts.covered}</strong> lefedett,
        <strong>{counts.reachable}</strong> elérhető szerep.
        {#if counts.unknown > 0}
          {counts.unknown} szerep nem szerepel a térképen, ezeket kihagytuk.
        {/if}
      </p>
      <p class="actions">
        {#if withListButton}
          <button type="button" class="button" onclick={showCvList}>
            Hiányzó készségek a listában
          </button>
        {/if}
        <button type="button" class="button" onclick={clearResult}> Eredmény eltüntetése </button>
      </p>
    </section>
  {/snippet}

  <!-- On the map the summary sits beside it, to leave the map the height; in the list, above. -->
  {#if cv.view}
    <div class="summary-top">{@render summary(false)}</div>
  {/if}

  <div class="toolbar">
    <div class="modes" role="group" aria-label="Nézet">
      <button
        type="button"
        class="button"
        aria-pressed={view === "map"}
        onclick={() => (mode = "map")}
      >
        Térkép
      </button>
      <button
        type="button"
        class="button"
        aria-pressed={view === "list"}
        onclick={() => (mode = "list")}
      >
        Lista
      </button>
    </div>
    <label class="field grow">
      <span>Keresés a szerepek között</span>
      <input type="search" bind:value={typed} autocomplete="off" spellcheck="false" />
    </label>
    <label class="field">
      <span>Szakterület</span>
      <select
        value={branch === null ? "" : String(branch)}
        onchange={(e) =>
          (branch = e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
      >
        <option value="">Minden ág</option>
        {#each map.branches as b, i (b.id)}
          <option value={String(i)}>{b.label}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span>Elrendezés</span>
      <select value={layout} onchange={(e) => chooseLayout(layoutOf(e.currentTarget.value))}>
        {#each LAYOUTS as l (l.id)}
          <option value={l.id}>{l.label}</option>
        {/each}
      </select>
    </label>
    <p class="found" role="status">{matches} szerep{pass ? " a szűrésben" : ""}</p>
  </div>

  <div class="views">
    <div class="map-view">
      <MapPane
        data={map}
        {marks}
        {reach}
        {pass}
        {selected}
        {layout}
        focus={branch ?? resultBranch}
        onselect={(id) => (selected = id)}
        {onready}
      />
      <div class="side">
        {#if cv.view}{@render summary(true)}{/if}
        <aside aria-label="A kijelölt szerep" aria-live="polite">
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
          {:else}
            <p class="hint">
              Kattints egy pontra a térképen a szerep adataihoz. Egérrel húzva forgathatod, a
              görgővel nagyíthatod, jobb gombbal húzva eltolhatod. A „Lista” nézet ugyanezt
              billentyűvel és képernyőolvasóval is eléri.
            </p>
          {/if}
        </aside>
      </div>
    </div>

    <div class="list-view">
      <RoleList
        data={map}
        {pass}
        states={cv.view?.states ?? null}
        picked={branch}
        searching={needle !== ""}
      />
    </div>
  </div>
</main>

<style>
  .page {
    max-width: 96rem;
    margin: 0 auto;
    padding: 0 1rem 2rem;
  }
  .intro {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 1.5rem;
    margin: 0.8rem 0 0.6rem;
  }
  .intro h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .intro p {
    flex: 1 1 24rem;
    max-width: 60rem;
    margin: 0;
    font-size: 0.92rem;
    color: var(--ink-soft);
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
    padding: 0.4rem 1rem;
    border: 1px solid var(--line);
    border-left: 0.35rem solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .summary p {
    margin: 0.3rem 0;
  }
  .side {
    display: grid;
    gap: 0.8rem;
  }
  .side .summary {
    margin: 0;
    padding-block: 0.6rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.6rem 1rem;
    margin-bottom: 1rem;
  }
  .modes {
    display: flex;
    gap: 0.3rem;
  }
  .field {
    display: grid;
    flex: 1 1 14rem;
    min-width: 0;
    gap: 0.15rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .field.grow {
    flex-grow: 2;
  }
  .field input,
  .field select {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--ink-soft);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    font-size: 1rem;
  }
  .found {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  .map-view {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .hint {
    margin: 0;
    padding: 0.8rem 1rem;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
    color: var(--ink-soft);
    font-size: 0.92rem;
  }

  /* Phones get the list; wide screens the map; a person's choice beats both. */
  .page[data-view="list"] .map-view,
  .page[data-view="auto"] .map-view {
    display: none;
  }
  .page[data-view="map"] .list-view,
  .page[data-view="map"] .summary-top {
    display: none;
  }
  @media (min-width: 60rem) {
    .page[data-view="auto"] .map-view {
      display: grid;
    }
    .page[data-view="auto"] .list-view,
    .page[data-view="auto"] .summary-top {
      display: none;
    }
    .map-view {
      grid-template-columns: minmax(0, 1fr) 22rem;
    }
  }
</style>
