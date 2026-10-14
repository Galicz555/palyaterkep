# Pályatérkép

A career map for Hungarian job seekers. Upload a CV and the map lights up the roles you have held,
the ones your skills already cover, and the ones one step away, each with the skills still missing.

Design decisions live in [`docs/adr`](docs/adr), terms in [`docs/glossary.md`](docs/glossary.md).

## Web app

`web/` is a SvelteKit app (adapter-node, Hungarian): a 3D map of every role, a list view that is
also its accessible equivalent, and one prerendered page per role. It reads the vault, the branch
table and ESCO at build time, so build ESCO first (`pnpm esco`).

```sh
pnpm web:dev      # development server
pnpm web:build    # prerenders every page into web/build
pnpm web:start    # serves the build on :3000
```

Until CV reading exists, a result comes from a file: open `/?cv=it-fejleszto` to load
`web/static/fixtures/it-fejleszto.json` (rebuilt from the vault with `node web/scripts/it-fixture.ts`).
`/?ag=it` flies to a branch, `/?szerep=<id>` picks a role, `/?nezet=list` opens the list.
`node web/scripts/screens.ts` takes the screenshots into `raw/screens/`, walks the list with the
keyboard alone and times the map's frames, against a running `pnpm web:start`.

## Data

Occupation and skill data: [ESCO](https://esco.ec.europa.eu) (European Skills, Competences,
Qualifications and Occupations) v1.2.1, © European Union. Reuse is authorised provided the source is
acknowledged.
