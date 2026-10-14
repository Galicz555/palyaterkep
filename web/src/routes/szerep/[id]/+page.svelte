<script lang="ts">
  // One role: what it is, how far out and on which track, whether anyone checked it, the skills
  // it needs, and the roles next to it. With a CV result it also says where the person stands.
  import RoleBadges from "#lib/components/RoleBadges.svelte";
  import StateInfo from "#lib/components/StateInfo.svelte";
  import { cv } from "#lib/cv.svelte.ts";
  import type { RoleLink } from "#lib/model.ts";
  import { capitalise, levelText, trackText } from "#lib/text.ts";

  let { data } = $props();
  const role = $derived(data.role);
  const name = $derived(capitalise(role.label));
  const heading = $derived(`${name} – mi kell hozzá`);
  const state = $derived(cv.view?.states.get(role.id));
  /** Roles a CV can reach this one from: the label of the one it did. */
  const fromLabel = $derived.by(() => {
    if (state?.kind !== "reachable") return undefined;
    const from = state.from;
    const known = [...role.lateral, ...role.previous].find((r) => r.id === from);
    return known ? capitalise(known.label) : undefined;
  });
  const skills = $derived(role.skills.filter((s) => !s.knowledge));
  const knowledge = $derived(role.skills.filter((s) => s.knowledge));
  const shown = (key: string) => cv.view?.skills.has(key) ?? false;
</script>

<svelte:head>
  <title>{heading} | Pályatérkép</title>
  <meta
    name="description"
    content="{name}: {levelText(role.level)}, {trackText(role.management)} pályatípus, {role
      .subBranch.label}. A szerephez kellő készségek és ismeretek, és a hasonló szerepek."
  />
</svelte:head>

{#snippet roleLinks(roles: RoleLink[])}
  <ul class="links">
    {#each roles as other (other.id)}
      <li>
        <a href="/szerep/{other.id}">{capitalise(other.label)}</a>
        <span>{levelText(other.level)}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet skillList(list: typeof role.skills)}
  <ul class="skills">
    {#each list as skill (skill.key)}
      <li class:have={shown(skill.key)}>
        {#if shown(skill.key)}<span class="tick" aria-hidden="true">✓</span><span class="sr-only"
            >Az önéletrajz mutatja:
          </span>{/if}{skill.label}
      </li>
    {/each}
  </ul>
{/snippet}

<main id="tartalom" class="role">
  <nav aria-label="Hol vagy" class="crumbs">
    <a href="/lista">Szerepek</a> › <a href="/lista?ag={role.branch.id}">{role.branch.label}</a> ›
    {role.subBranch.label}
  </nav>

  <h1>{heading}</h1>
  <p class="meta">
    <RoleBadges level={role.level} management={role.management} curated={role.curated} />
  </p>
  <p>
    <a class="button" href="/?ag={role.branch.id}&szerep={role.id}"> Megnézem a térképen </a>
  </p>

  {#if !role.curated}
    <p class="notice">
      <strong>Gépi javaslat, nem ellenőrzött.</strong> A szerep szintjét és pályatípusát nyelvi modell
      javasolta a foglalkozás ESCO-beli neve és leírása alapján, a készséglista az ESCO alapvető készségei.
      Ember még nem nézte át.
    </p>
  {/if}

  {#if state}
    <section class="cv" aria-labelledby="cv-h">
      <h2 id="cv-h">Az önéletrajzod alapján</h2>
      <StateInfo {state} {fromLabel} />
    </section>
  {/if}

  <section aria-labelledby="need-h">
    <h2 id="need-h">Mi kell hozzá?</h2>
    <p class="desc">{role.description}</p>
    {#if cv.view}
      <p class="legend"><span class="tick-key" aria-hidden="true">✓</span> az önéletrajz mutatja</p>
    {/if}
    {#if skills.length > 0}
      <h3>Készségek ({skills.length})</h3>
      {@render skillList(skills)}
    {/if}
    {#if knowledge.length > 0}
      <h3>Ismeretek ({knowledge.length})</h3>
      {@render skillList(knowledge)}
    {/if}
    <p class="source">ESCO {role.code}</p>
  </section>

  {#if role.lateral.length > 0}
    <section aria-labelledby="lat-h">
      <h2 id="lat-h">Hasonló szerepek, ahová át lehet váltani</h2>
      {@render roleLinks(role.lateral)}
    </section>
  {/if}
  {#if role.progression.length > 0}
    <section aria-labelledby="next-h">
      <h2 id="next-h">Következő lépések</h2>
      {@render roleLinks(role.progression)}
    </section>
  {/if}
  {#if role.previous.length > 0}
    <section aria-labelledby="prev-h">
      <h2 id="prev-h">Innen lehet ide lépni</h2>
      {@render roleLinks(role.previous)}
    </section>
  {/if}
</main>

<style>
  .role {
    max-width: 52rem;
    margin: 0 auto;
    padding: 0 1rem 2rem;
  }
  .crumbs {
    margin: 1rem 0 0;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  h1 {
    margin: 0.4rem 0 0.4rem;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
  }
  .meta {
    margin: 0 0 1rem;
  }
  .notice {
    padding: 0.7rem 1rem;
    border-left: 0.35rem solid var(--proposal);
    border-radius: 0.25rem;
    background: #eeeef2;
    color: var(--ink);
  }
  .cv {
    margin: 1.2rem 0;
    padding: 0.2rem 1rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .desc {
    max-width: 44rem;
  }
  .skills,
  .links {
    margin: 0.3rem 0;
    padding-left: 1.2rem;
    columns: 20rem;
    column-gap: 2rem;
  }
  .skills li,
  .links li {
    break-inside: avoid;
    margin-bottom: 0.25rem;
  }
  .links {
    padding: 0;
    list-style: none;
  }
  .links span {
    display: block;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .skills li.have {
    list-style: none;
    margin-left: -1.2rem;
    padding-left: 1.2rem;
    position: relative;
  }
  .tick {
    position: absolute;
    left: 0;
  }
  .tick,
  .tick-key {
    color: var(--covered);
    font-weight: 700;
  }
  .legend {
    margin: 0.2rem 0;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .source {
    margin-top: 1rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
</style>
