<script lang="ts">
  // The way between the pages. On the map it is a small panel over it, elsewhere a bar on top.
  import { page } from "$app/state";
  import { cv } from "#lib/cv.svelte.ts";

  let { overlay = false }: { overlay?: boolean } = $props();

  // The sources and the privacy notice sit at the foot of the CV page, next to where a CV is given.
  const LINKS = [
    { href: "/", text: "Térkép" },
    { href: "/lista", text: "Lista" },
    { href: "/oneletrajz", text: "Önéletrajz" },
    { href: "/oneletrajz#forrasok", text: "Források" },
  ] as const;
</script>

<header class="site" class:overlay>
  <a class="brand" href="/">Pályatérkép</a>
  <nav aria-label="Oldalak">
    <ul>
      {#each LINKS as link (link.href)}
        <li>
          <a href={link.href} aria-current={page.url.pathname === link.href ? "page" : undefined}>
            {link.text}{#if link.href === "/oneletrajz" && cv.view}<span class="sr-only">
                (beolvasva)</span
              ><span class="have" aria-hidden="true">✓</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</header>

<style>
  .site {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 1.2rem;
    max-width: 96rem;
    margin: 0 auto;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  .brand {
    font-weight: 800;
    font-size: 1.15rem;
    color: var(--ink);
    text-decoration: none;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  nav a {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 2.75rem;
    padding: 0 0.7rem;
    color: var(--ink);
    text-decoration: none;
  }
  nav a:hover {
    text-decoration: underline;
  }
  nav a[aria-current="page"] {
    font-weight: 700;
    box-shadow: inset 0 -0.2rem 0 var(--accent);
  }
  .have {
    color: var(--covered);
    font-weight: 700;
  }

  /* Over the map: a dark panel in the corner, so the map keeps the rest of the screen. */
  .overlay {
    position: fixed;
    left: 0.6rem;
    top: 0.6rem;
    z-index: 5;
    max-width: calc(100% - 1.2rem);
    padding: 0 0.5rem 0 0.9rem;
    border: 1px solid var(--stage-line);
    border-radius: var(--radius);
    background: rgb(11 13 18 / 0.88);
    color: var(--stage-ink);
  }
  .overlay .brand,
  .overlay nav a {
    color: var(--stage-ink);
  }
  .overlay nav a[aria-current="page"] {
    box-shadow: inset 0 -0.2rem 0 var(--stage-focus);
  }
  .overlay .have {
    color: #fff;
  }
  .overlay a:focus-visible {
    outline-color: var(--stage-focus);
  }
</style>
