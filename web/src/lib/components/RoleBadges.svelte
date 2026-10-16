<script lang="ts">
  // Level, track and whether a person checked the role: the three facts shown wherever a role is.
  import { CHECKED, levelText, trackText, UNCHECKED } from "#lib/text.ts";
  import type { Level } from "#lib/model.ts";
  import { REPLACEABLE_LABEL } from "#lib/replaceable.svelte.ts";

  interface Props {
    level: Level;
    management: boolean;
    curated: boolean;
    /** Strongly replaceable by generative AI, and the switch for it is on. */
    replaceable?: boolean;
  }
  let { level, management, curated, replaceable = false }: Props = $props();
</script>

<span class="badges">
  <span>{levelText(level)}</span>
  <span>{trackText(management)}</span>
  {#if replaceable}
    <span class="replaceable">{REPLACEABLE_LABEL} (MI)</span>
  {/if}
  {#if curated}
    <span class="checked"><span aria-hidden="true">✓</span> {CHECKED}</span>
  {:else}
    <span class="proposal">{UNCHECKED}</span>
  {/if}
</span>

<style>
  .badges {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.6rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .replaceable {
    color: var(--replaceable, #a8470f);
    font-weight: 600;
  }
  .proposal {
    font-style: italic;
    color: var(--proposal);
  }
  .checked {
    color: var(--covered);
    font-weight: 600;
  }
</style>
