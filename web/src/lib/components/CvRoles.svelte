<script lang="ts">
  // What a CV result says, role by role: held, covered, and reachable with the skills still missing.
  import type { RoleState } from "#lib/cv.ts";
  import type { MapData, MapRole } from "#lib/model.ts";
  import { capitalise } from "#lib/text.ts";
  import RoleBadges from "./RoleBadges.svelte";
  import StateInfo from "./StateInfo.svelte";

  interface Props {
    data: MapData;
    /** What the CV says, by role id. */
    states: Map<string, RoleState>;
  }
  let { data, states }: Props = $props();

  const indexOf = $derived(new Map(data.roles.map((r, i) => [r.id, i])));
  const pathOf = (role: MapRole) => {
    const branch = data.branches[role.branch];
    return `${branch?.label} › ${branch?.subBranches[role.sub]?.label}`;
  };

  const cvRoles = $derived.by(() => {
    const out = { held: [] as MapRole[], covered: [] as MapRole[], reachable: [] as MapRole[] };
    for (const [id, state] of states) {
      const i = indexOf.get(id);
      if (i === undefined) continue;
      out[state.kind].push(data.roles[i]!);
    }
    const coverage = (r: MapRole) => {
      const state = states.get(r.id);
      return state?.kind === "covered" ? state.coverage : 0;
    };
    const gap = (r: MapRole) => {
      const state = states.get(r.id);
      return state?.kind === "reachable" ? state.gap.length : 0;
    };
    out.covered.sort((a, b) => coverage(b) - coverage(a));
    out.reachable.sort((a, b) => gap(a) - gap(b) || a.label.localeCompare(b.label, "hu"));
    return out;
  });
  const CV_GROUPS = [
    ["held", "Betöltött szerepek"],
    ["covered", "Lefedett szerepek"],
    ["reachable", "Elérhető szerepek, hiányzó készségekkel"],
  ] as const;
  const fromLabel = (state: RoleState | undefined) => {
    if (state?.kind !== "reachable") return undefined;
    const i = indexOf.get(state.from);
    return i === undefined ? undefined : capitalise(data.roles[i]!.label);
  };
</script>

<section aria-labelledby="cv-title" class="cv" id="cv-list">
  <h2 id="cv-title">Az önéletrajz alapján</h2>
  {#each CV_GROUPS as [kind, title] (kind)}
    {@const roles = cvRoles[kind]}
    {#if roles.length > 0}
      <h3>{title} ({roles.length})</h3>
      <ul class="roles">
        {#each roles as role (role.id)}
          {@const state = states.get(role.id)}
          <li class="role">
            <a class="name" href="/szerep/{role.id}">{capitalise(role.label)}</a>
            <span class="path">{pathOf(role)}</span>
            <RoleBadges level={role.level} management={role.management} curated={role.curated} />
            {#if state}<StateInfo {state} fromLabel={fromLabel(state)} />{/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
</section>

<style>
  .cv {
    margin-bottom: 1.5rem;
    padding: 0.2rem 1rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .cv h2 {
    font-size: 1.2rem;
  }
  .cv h3 {
    margin: 1.2rem 0 0.2rem;
    font-size: 1.05rem;
  }
  .roles {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .role {
    padding: 0.8rem 0.2rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  .name,
  .path {
    display: block;
  }
  .name {
    font-weight: 600;
    min-height: 1.5rem;
  }
  .path {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
</style>
