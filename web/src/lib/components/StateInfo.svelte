<script lang="ts">
  // What the CV says about one role, in words: held with its evidence, covered with the share of
  // skills, reachable with the gap list. Colour is never the only carrier. `brief` leaves out the
  // evidence and the gap list, for a small card that links to where they are.
  import type { RoleState } from "#lib/cv.ts";
  import GapList from "./GapList.svelte";

  interface Props {
    state: RoleState;
    /** Name of the role a reachable role is reached from; falls back to its id. */
    fromLabel?: string | undefined;
    brief?: boolean;
  }
  let { state, fromLabel, brief = false }: Props = $props();
</script>

{#if state.kind === "held"}
  <p class="line held">
    <strong>Betöltött szerep.</strong>
    {#if !brief}Az önéletrajz ezt mutatja:{/if}
  </p>
  {#if !brief}
    <ul class="quotes">
      {#each state.evidence as quote, i (i)}
        <li><q>{quote}</q></li>
      {/each}
    </ul>
  {/if}
{:else if state.kind === "covered"}
  <p class="line covered">
    <strong>Lefedett szerep.</strong> A szükséges készségek {Math.round(state.coverage * 100)} százalékát
    mutatja az önéletrajz.
  </p>
{:else}
  <p class="line reach">
    <strong>Elérhető szerep</strong>, {state.edge === "progression" ? "előrelépés" : "váltás"} innen:
    <a href="/szerep/{state.from}">{fromLabel ?? state.from}</a>.
  </p>
  {#if brief}
    <p class="gap-title">{state.gap.length} hiányzó készség</p>
  {:else}
    <p class="gap-title">Hiányzó készségek ({state.gap.length}):</p>
    <GapList gap={state.gap} />
  {/if}
{/if}

<style>
  .line {
    margin: 0.5rem 0 0;
    padding: 0.4rem 0.6rem;
    border-left: 0.3rem solid;
    border-radius: 0.25rem;
    font-size: 0.92rem;
  }
  .held {
    border-color: var(--held);
    background: var(--held-bg);
    color: var(--held);
  }
  .covered {
    border-color: var(--covered);
    background: var(--covered-bg);
    color: var(--covered);
  }
  .reach {
    border-color: var(--reach);
    background: var(--reach-bg);
    color: var(--reach);
  }
  .reach a {
    color: inherit;
  }
  .quotes {
    margin: 0.3rem 0 0;
    padding-left: 1.2rem;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .gap-title {
    margin: 0.6rem 0 0;
    font-size: 0.9rem;
    font-weight: 600;
  }
</style>
