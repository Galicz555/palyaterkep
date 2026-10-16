<script lang="ts">
  // The role picked on the map, in a card over it: the facts at a glance, and a link to the role's page.
  import type { RoleState } from "#lib/cv.ts";
  import type { MapRole } from "#lib/model.ts";
  import { REPLACEABLE_NOTE } from "#lib/replaceable.svelte.ts";
  import { capitalise } from "#lib/text.ts";
  import RoleBadges from "./RoleBadges.svelte";
  import StateInfo from "./StateInfo.svelte";

  interface Props {
    role: MapRole;
    /** „Ág › kisebb ág”. */
    path: string;
    state?: RoleState | undefined;
    fromLabel?: string | undefined;
    /** Strongly replaceable by generative AI, and the switch for it is on. */
    replaceable?: boolean;
    onclose: () => void;
  }
  let { role, path, state, fromLabel, replaceable = false, onclose }: Props = $props();
</script>

<article class="panel">
  <header>
    <h2>{capitalise(role.label)}</h2>
    <button type="button" class="close" onclick={onclose} aria-label="Kijelölés megszüntetése">
      ×
    </button>
  </header>
  <p class="path">{path}</p>
  <p>
    <RoleBadges
      level={role.level}
      management={role.management}
      curated={role.curated}
      {replaceable}
    />
  </p>
  {#if replaceable}
    <p class="note">{REPLACEABLE_NOTE}</p>
  {/if}
  {#if state}
    <StateInfo {state} {fromLabel} brief />
  {/if}
  <p class="more"><a class="button" href="/szerep/{role.id}">Mi kell hozzá? Készséglista</a></p>
</article>

<style>
  .panel {
    padding: 0.9rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: start;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .close {
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    margin: -0.5rem -0.6rem 0 0;
    border: 0;
    background: none;
    font-size: 1.6rem;
    line-height: 1;
    color: var(--ink-soft);
  }
  .path {
    margin: 0.2rem 0 0.4rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .note {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .more {
    margin: 0.8rem 0 0;
  }
</style>
