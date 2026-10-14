<script lang="ts">
  // The list view: every role, grouped by branch and sub-branch, and what the CV says about them.
  // It is the accessible equivalent of the map: plain headings, lists and links, so a keyboard or a
  // screen reader reaches everything the map shows. Branches are closed `<details>`, so the tab
  // order is not three thousand links long.
  import type { RoleState } from "#lib/cv.ts";
  import type { MapData, MapRole } from "#lib/model.ts";
  import { branchPainted } from "#lib/palette.ts";
  import { capitalise } from "#lib/text.ts";
  import RoleBadges from "./RoleBadges.svelte";
  import StateInfo from "./StateInfo.svelte";

  interface Props {
    data: MapData;
    /** Roles to show (a 1 each); null shows all. */
    pass: Uint8Array | null;
    /** What the CV says, by role id; null without a result. */
    states: Map<string, RoleState> | null;
    /** The branch the person picked: opened for them. */
    picked: number | null;
    /** A search is on: every branch with a match opens. */
    searching: boolean;
  }
  let { data, pass, states, picked, searching }: Props = $props();

  const KIND_TEXT = { held: "Betöltött", covered: "Lefedett", reachable: "Elérhető" } as const;

  const indexOf = $derived(new Map(data.roles.map((r, i) => [r.id, i])));
  const shown = (i: number) => !pass || pass[i] === 1;
  const stateOf = (role: MapRole) => states?.get(role.id);
  const pathOf = (role: MapRole) => {
    const branch = data.branches[role.branch];
    return `${branch?.label} › ${branch?.subBranches[role.sub]?.label}`;
  };

  /** Role indices by branch and sub-branch, in the order of the table. */
  const groups = $derived(
    data.branches.map((branch, b) => ({
      branch,
      subs: branch.subBranches.map((sub, s) => ({
        sub,
        indices: data.roles.flatMap((r, i) => (r.branch === b && r.sub === s ? [i] : [])),
      })),
    })),
  );
  const visible = $derived(groups.map((g) => g.subs.map((s) => s.indices.filter((i) => shown(i)))));
  const total = $derived(
    visible.reduce((n, subs) => n + subs.reduce((m, s) => m + s.length, 0), 0),
  );

  /** Open or closed as the person left it (a click on the summary); until then, what the search and the pick say. */
  let touched = $state<Record<string, boolean>>({});
  const isOpen = (id: string, b: number, matches: number) =>
    touched[id] ?? (matches > 0 && (searching || picked === b));

  const cvRoles = $derived.by(() => {
    const out = { held: [] as MapRole[], covered: [] as MapRole[], reachable: [] as MapRole[] };
    for (const [id, state] of states ?? []) {
      const i = indexOf.get(id);
      if (i === undefined || !shown(i)) continue;
      out[state.kind].push(data.roles[i]!);
    }
    const coverage = (r: MapRole) => {
      const state = states?.get(r.id);
      return state?.kind === "covered" ? state.coverage : 0;
    };
    const gap = (r: MapRole) => {
      const state = states?.get(r.id);
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

{#snippet roleRow(role: MapRole, withPath: boolean)}
  {@const state = stateOf(role)}
  <li class="role">
    <a class="name" href="/szerep/{role.id}">{capitalise(role.label)}</a>
    {#if state}
      <span class="tag tag-{state.kind}">{KIND_TEXT[state.kind]}</span>
    {/if}
    {#if withPath}<span class="path">{pathOf(role)}</span>{/if}
    <RoleBadges level={role.level} management={role.management} curated={role.curated} />
  </li>
{/snippet}

<section aria-labelledby="list-title" class="list">
  <h2 id="list-title" class="sr-only">Szerepek listája</h2>

  {#if states}
    <section aria-labelledby="cv-title" class="cv" id="cv-list">
      <h3 id="cv-title">Az önéletrajz alapján</h3>
      {#each CV_GROUPS as [kind, title] (kind)}
        {@const roles = cvRoles[kind]}
        {#if roles.length > 0}
          <h4>{title} ({roles.length})</h4>
          <ul class="roles">
            {#each roles as role (role.id)}
              {@const state = stateOf(role)}
              <li class="role detailed">
                <a class="name" href="/szerep/{role.id}">{capitalise(role.label)}</a>
                <span class="path">{pathOf(role)}</span>
                <RoleBadges
                  level={role.level}
                  management={role.management}
                  curated={role.curated}
                />
                {#if state}<StateInfo {state} fromLabel={fromLabel(state)} />{/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/each}
    </section>
  {/if}

  <nav aria-label="Ugrás egy ághoz" class="jump">
    <ul>
      {#each data.branches as branch, b (branch.id)}
        <li>
          <a href="#ag-{branch.id}" onclick={() => (touched[branch.id] = true)}>
            <i style:background={branchPainted(b)} aria-hidden="true"></i>
            {branch.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  {#if total === 0}
    <p class="empty" role="status">
      Nincs ilyen szerep. Próbálj rövidebb szót, vagy válaszd a „Minden ág” lehetőséget.
    </p>
  {/if}

  {#each groups as group, b (group.branch.id)}
    {@const matches = visible[b]!.reduce((n, s) => n + s.length, 0)}
    {#if matches > 0}
      {@const open = isOpen(group.branch.id, b, matches)}
      <details id="ag-{group.branch.id}" {open}>
        <summary
          onclick={(e) => {
            // The state is ours to set: the browser's own toggle would fight it.
            e.preventDefault();
            touched[group.branch.id] = !open;
          }}
        >
          <i style:background={branchPainted(b)} aria-hidden="true"></i>
          <span class="branch-name">{group.branch.label}</span>
          <span class="count">{matches} szerep</span>
        </summary>
        {#each group.subs as sub, s (sub.sub.id)}
          {@const indices = visible[b]![s]!}
          {#if indices.length > 0}
            <h3>{sub.sub.label}</h3>
            <ul class="roles">
              {#each indices as i (data.roles[i]!.id)}
                {@render roleRow(data.roles[i]!, false)}
              {/each}
            </ul>
          {/if}
        {/each}
      </details>
    {/if}
  {/each}
</section>

<style>
  .list {
    max-width: 62rem;
  }
  .cv {
    margin-bottom: 1.5rem;
    padding: 0.2rem 1rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .cv h3 {
    font-size: 1.2rem;
  }
  .cv h4 {
    margin: 1.2rem 0 0.2rem;
  }
  .roles {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .role {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.1rem 0.8rem;
    padding: 0.55rem 0.2rem;
    border-bottom: 1px solid var(--line);
  }
  .role.detailed {
    display: block;
    padding: 0.8rem 0.2rem 1rem;
  }
  .detailed .name,
  .detailed .path {
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
  .tag {
    padding: 0 0.45rem;
    border-radius: 1rem;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .tag-held {
    background: var(--held-bg);
    color: var(--held);
  }
  .tag-covered {
    background: var(--covered-bg);
    color: var(--covered);
  }
  .tag-reachable {
    background: var(--reach-bg);
    color: var(--reach);
  }
  /* On a phone the closed branches below are themselves the index. */
  @media (max-width: 59.99rem) {
    .jump {
      display: none;
    }
  }
  .jump ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0 0 1.2rem;
    padding: 0;
    list-style: none;
  }
  .jump a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0.2rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 2rem;
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
    font-size: 0.9rem;
  }
  .jump a:hover {
    border-color: var(--accent);
  }
  i {
    flex: none;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
  }
  details {
    margin-bottom: 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 3rem;
    padding: 0.4rem 1rem;
    cursor: pointer;
  }
  .branch-name {
    font-weight: 700;
    font-size: 1.05rem;
  }
  .count {
    margin-left: auto;
    white-space: nowrap;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  details h3 {
    margin: 0.8rem 1rem 0.1rem;
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  details .roles {
    padding: 0 1rem 0.5rem;
  }
  .empty {
    padding: 1rem;
    color: var(--ink-soft);
  }
</style>
