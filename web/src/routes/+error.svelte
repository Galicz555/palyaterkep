<script lang="ts">
  import { page } from "$app/state";
</script>

<svelte:head>
  <title>{page.status === 404 ? "Nincs ilyen oldal" : "Hiba"} | Pályatérkép</title>
</svelte:head>

<main id="tartalom" class="error">
  <h1>{page.status === 404 ? "Nincs ilyen oldal" : "Valami elromlott"}</h1>
  <p>{page.error?.message}</p>
  <p><a class="button" href="/">Vissza a térképre</a></p>
</main>

<style>
  .error {
    max-width: 40rem;
    margin: 2rem auto;
    padding: 0 1rem;
  }
</style>
