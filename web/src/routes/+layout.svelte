<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import SiteNav from "#lib/components/SiteNav.svelte";
  import { cv } from "#lib/cv.svelte.ts";

  let { children, data } = $props();

  // The map has the whole screen: only its overlay nav, no footer. Every other page is a page.
  const onMap = $derived(page.url.pathname === "/");

  // A demo without a reading: ?cv=it-fejleszto shows a stored result (static/fixtures).
  onMount(() => {
    const name = new URLSearchParams(location.search).get("cv");
    if (name) void cv.loadFixture(name);
  });
</script>

<a class="skip" href="#tartalom">Ugrás a tartalomra</a>

<SiteNav overlay={onMap} />

{#if cv.error}
  <p class="problem" class:overlay={onMap} role="alert">{cv.error}</p>
{/if}

{@render children()}

{#if !onMap}
  <footer class="site" id="forrasok">
    <p>
      Foglalkozás- és készségadatok: <a href="https://esco.ec.europa.eu">ESCO</a>
      {data.esco}, © Európai Unió. A szerepek szintjét és pályatípusát nyelvi modell javasolta (gépi
      javaslat, nem ellenőrzött); a készséglista az ESCO alapvető készségeit sorolja fel.
    </p>
    <p>
      A terhelési adatok forrása: <a href="https://www.onetcenter.org">O*NET</a> 31.0, U.S. Department
      of Labor/ETA, CC BY 4.0.
    </p>
  </footer>
{/if}

<style>
  .site {
    max-width: 96rem;
    margin: 1rem auto 0;
    padding: 0.7rem 1rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .site p {
    max-width: 60rem;
  }
  .problem {
    max-width: 96rem;
    margin: 0.8rem auto 0;
    padding: 0.6rem 1rem;
    border-left: 0.35rem solid #a02020;
    background: #fbe9e9;
    color: #6b1010;
  }
  .problem.overlay {
    position: fixed;
    left: 50%;
    top: 0.6rem;
    z-index: 6;
    max-width: min(36rem, calc(100% - 1.2rem));
    margin: 0;
    transform: translateX(-50%);
  }
</style>
