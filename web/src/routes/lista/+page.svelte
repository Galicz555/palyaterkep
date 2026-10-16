<script lang="ts">
  // Every role as a plain list: the way through the map for a keyboard, a screen reader and a phone.
  import { onMount } from "svelte";
  import RoleList from "#lib/components/RoleList.svelte";
  import { cv } from "#lib/cv.svelte.ts";
  import { countStates } from "#lib/cv.ts";
  import { replaceable } from "#lib/replaceable.svelte.ts";
  import { fold } from "#lib/text.ts";

  let { data } = $props();
  const map = $derived(data.map);
  const known = $derived(new Set(map.roles.map((r) => r.id)));
  const folded = $derived(map.roles.map((r) => fold(r.label)));

  // Search (debounced: typing should not redraw three thousand rows per key) and branch.
  let typed = $state("");
  let query = $state("");
  let branch = $state<number | null>(null);
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
  const counts = $derived(cv.view ? countStates(cv.view.states, (id) => known.has(id)) : null);

  // A link from a role page names the branch: `?ag=it`.
  onMount(() => {
    const ag = map.branches.findIndex(
      (b) => b.id === new URLSearchParams(location.search).get("ag"),
    );
    if (ag >= 0) branch = ag;
    replaceable.read();
  });
</script>

<svelte:head>
  <title>Szerepek listája | Pályatérkép</title>
  <meta
    name="description"
    content="Minden szerep szakterület és kisebb ág szerint, szinttel és pályatípussal, linkekkel a szerepek oldalára."
  />
</svelte:head>

<main id="tartalom" class="page">
  <h1>Szerepek listája</h1>
  <p class="lead">
    Minden szerep a szakterülete szerint. Ugyanez látszik <a href="/">a térképen</a> is, térben elhelyezve.
  </p>

  {#if counts}
    <p class="cvline">
      Az önéletrajzod alapján <strong>{counts.held}</strong> betöltött,
      <strong>{counts.covered}</strong> lefedett, <strong>{counts.reachable}</strong> elérhető
      szerep.
      <a href="/oneletrajz">A hiányzó készségek az önéletrajz oldalon</a> vannak.
    </p>
  {/if}

  <div class="toolbar">
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
    <label class="switch">
      <input
        type="checkbox"
        role="switch"
        checked={replaceable.on}
        onchange={(e) => replaceable.set(e.currentTarget.checked)}
      />
      <span>MI-kiváltás: jelölje az erősen kiváltható szerepeket</span>
    </label>
    <p class="found" role="status">{matches} szerep{pass ? " a szűrésben" : ""}</p>
  </div>

  <RoleList
    data={map}
    {pass}
    states={cv.view?.states ?? null}
    picked={branch}
    searching={needle !== ""}
    replaceable={replaceable.on}
  />
</main>

<style>
  .page {
    max-width: 96rem;
    margin: 0 auto;
    padding: 0 1rem 2rem;
  }
  h1 {
    margin: 1rem 0 0.3rem;
    font-size: 1.4rem;
  }
  .lead,
  .cvline {
    max-width: 60rem;
    margin: 0 0 0.8rem;
    color: var(--ink-soft);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.6rem 1rem;
    margin-bottom: 1rem;
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
  .switch {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.75rem;
    font-size: 0.9rem;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .switch input {
    width: 1.3rem;
    height: 1.3rem;
    margin: 0;
  }
  .found {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
</style>
