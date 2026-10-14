<script lang="ts">
  // The CV page: give a CV, and read what it says. The result is kept in memory (cv.svelte.ts), so
  // the map and the list show it too as long as the person stays in this tab.
  import { tick } from "svelte";
  import CvRoles from "#lib/components/CvRoles.svelte";
  import CvUpload from "#lib/components/CvUpload.svelte";
  import { cv } from "#lib/cv.svelte.ts";
  import { countStates } from "#lib/cv.ts";

  let { data } = $props();
  const known = $derived(new Set(data.map.roles.map((r) => r.id)));
  const counts = $derived(cv.view ? countStates(cv.view.states, (id) => known.has(id)) : null);

  /** A result replaces the upload form, so focus goes to the summary that is on screen. */
  async function focusSummary() {
    await tick();
    document.querySelector<HTMLElement>(".summary")?.focus();
  }

  /** Clearing brings the upload form back; focus follows it. */
  async function clearResult() {
    cv.clear();
    await tick();
    document.getElementById("cv-upload-title")?.focus();
  }
</script>

<svelte:head>
  <title>Önéletrajz | Pályatérkép</title>
  <meta
    name="description"
    content="Töltsd fel az önéletrajzod, és a térképen látod, melyik szerepet töltötted be, melyiket fedik le a készségeid, és melyik van egy lépésre."
  />
</svelte:head>

<main id="tartalom" class="page">
  <h1>Önéletrajz</h1>

  {#if counts && cv.view}
    <section class="summary" aria-label="Az önéletrajz eredménye" tabindex="-1">
      <p>
        <strong>{counts.held}</strong> betöltött, <strong>{counts.covered}</strong> lefedett,
        <strong>{counts.reachable}</strong> elérhető szerep.
        {#if counts.unknown > 0}
          {counts.unknown} szerep nem szerepel a térképen, ezeket kihagytuk.
        {/if}
      </p>
      <p class="actions">
        <a class="button" href="/">Megnézem a térképen</a>
        <a class="button" href="/lista">A szerepek listája</a>
        <button type="button" class="button" onclick={clearResult}>Eredmény eltüntetése</button>
      </p>
    </section>
    <CvRoles data={data.map} states={cv.view.states} />
  {:else}
    <p class="lead">
      Az önéletrajzod beolvasása után a térképen látszik, melyiket töltötted be, melyiket fedik le a
      készségeid, és melyik van egy lépésre, a hiányzó készségekkel. Az eredmény addig marad meg,
      amíg ebben a lapon maradsz; a térképre és a listára átlépve is látod.
    </p>
    <CvUpload maxChars={data.maxChars} ondone={focusSummary} />
  {/if}
</main>

<style>
  .page {
    max-width: 62rem;
    margin: 0 auto;
    padding: 0 1rem 2rem;
  }
  h1 {
    margin: 1rem 0 0.3rem;
    font-size: 1.4rem;
  }
  .lead {
    margin: 0 0 1rem;
    color: var(--ink-soft);
  }
  .summary {
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.6rem 0 0.4rem;
  }
</style>
