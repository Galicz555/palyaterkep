<script lang="ts">
  // The skills a reachable role needs that the CV does not show. Names come from /skills.json,
  // which loads once there is a result (cv.svelte.ts).
  import { cv } from "#lib/cv.svelte.ts";

  let { gap }: { gap: string[] } = $props();

  const names = $derived(
    gap
      .map((uri) => cv.label(uri) ?? "ismeretlen készség")
      .sort((a, b) => a.localeCompare(b, "hu")),
  );
</script>

{#if gap.length === 0}
  <p class="none">Nincs hiányzó készség: az önéletrajz mindent mutat, amit a szerep kér.</p>
{:else if cv.labelsFailed}
  <p class="none" role="alert">A készségnevek nem tölthetők be.</p>
{:else if !cv.labelsLoaded}
  <p class="none" role="status">A készségnevek betöltődnek…</p>
{:else}
  <ul class="gap">
    {#each names as name, i (i)}
      <li>{name}</li>
    {/each}
  </ul>
{/if}

<style>
  .gap {
    margin: 0.3rem 0 0;
    padding-left: 1.2rem;
    columns: 18rem;
    column-gap: 1.5rem;
    font-size: 0.9rem;
  }
  .gap li {
    break-inside: avoid;
    margin-bottom: 0.1rem;
  }
  .none {
    margin: 0.3rem 0 0;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
</style>
