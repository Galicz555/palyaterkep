<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { cv } from "#lib/cv.svelte.ts";

  let { children, data } = $props();

  // A demo without a reading: ?cv=it-fejleszto shows a stored result (static/fixtures).
  onMount(() => {
    const name = new URLSearchParams(location.search).get("cv");
    if (name) void cv.loadFixture(name);
  });
</script>

<a class="skip" href="#tartalom">Ugrás a tartalomra</a>

<header class="site">
  <a class="brand" href="/">Pályatérkép</a>
</header>

{#if cv.error}
  <p class="problem" role="alert">{cv.error}</p>
{/if}

{@render children()}

<footer class="site">
  <p>
    Foglalkozás- és készségadatok: <a href="https://esco.ec.europa.eu">ESCO</a>
    {data.esco}, © Európai Unió. A szerepek szintjét és pályatípusát nyelvi modell javasolta (gépi
    javaslat, nem ellenőrzött); a készséglista az ESCO alapvető készségeit sorolja fel.
  </p>
  <p>
    A terhelési adatok forrása: <a href="https://www.onetcenter.org">O*NET</a> 31.0, U.S. Department of
    Labor/ETA, CC BY 4.0.
  </p>
</footer>

<style>
  .site {
    max-width: 96rem;
    margin: 0 auto;
    padding: 0.7rem 1rem;
  }
  header.site {
    border-bottom: 1px solid var(--line);
  }
  .brand {
    font-weight: 800;
    font-size: 1.15rem;
    color: var(--ink);
    text-decoration: none;
  }
  .problem {
    max-width: 96rem;
    margin: 0.8rem auto 0;
    padding: 0.6rem 1rem;
    border-left: 0.35rem solid #a02020;
    background: #fbe9e9;
    color: #6b1010;
  }
  footer.site {
    margin-top: 1rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  footer p {
    max-width: 60rem;
  }
</style>
