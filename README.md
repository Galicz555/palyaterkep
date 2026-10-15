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

### Reading a CV

The page takes a PDF (its text is read in the browser with pdf.js, loaded only when a file is
chosen) or pasted text, and posts `{ "text": … }` to `/api/cv`. The route runs the reading core
(`src/cv`) on a graph and mapper loaded once per server process and answers with the `CvResult`,
which the map and the list show. The server never receives a file. The CV is not stored: not on
disk, not in the log, not in browser storage; the log carries counts, timings, and the claims the
verify gate dropped and the errors with their quoted spans cut out.

| Status | When                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| 200    | the result                                                                        |
| 400    | the text is empty or over 30 000 characters, or the body is not JSON with a text  |
| 429    | one client address has used its readings for the hour; `Retry-After`              |
| 503    | the day's spend cap would be passed; `Retry-After` runs to the end of the UTC day |
| 500    | anything else, with a generic text; the cause is in the server log                |

The model is chosen by the environment: `CV_MODEL=subscription` sends the prompts to the subscription
CLI (local dev only, no API spend), otherwise the Claude API with `ANTHROPIC_API_KEY` (`pnpm web:start`
reads the repository's `.env`); with neither the route answers 500 and the server says why at start.
Every reading goes through the spend guard in `raw/cv-spend.sqlite`: `CV_DAILY_CAP_USD` (default 2) and
`CV_PER_CLIENT_PER_HOUR` (default 10). Behind a proxy, set adapter-node's `ADDRESS_HEADER`, or every
visitor shares one client address.

`CV_MODEL=subscription HOST=127.0.0.1 PORT=4173 CV_PER_CLIENT_PER_HOUR=30 pnpm web:start`, then
`node web/scripts/cv-e2e.ts <base url>` drives headless Chrome through a made-up CV as a PDF and as pasted text,
the refusals, and the page's error states, with screenshots in `raw/screens/`. Add `real` or `canned` after the base URL to run
only what needs no model.

Without a model, open `/?cv=it-fejleszto` to load `web/static/fixtures/it-fejleszto.json` (placed by
`placeCv`; rebuild it with `node web/scripts/it-fixture.ts` after the vault or the rules change).
`/?ag=it` shows a branch, `/?szerep=<id>` picks a role, `/?nezet=list` opens the list,
`/?elrendezes=B` chooses the map's layout (A is the default).
`node web/scripts/screens.ts` takes the screenshots into `raw/screens/` (one map per layout, bare and
with the demo CV), walks the list with the keyboard alone, checks hover, picking, the arrow keys, the
branch filter and the CV's marks in every layout, and times the map's frames per layout, against a
running `pnpm web:start`. `CHROME_FLAGS` picks the GPU backend; headless Chrome falls back to a
software renderer without it.

## Data

Occupation and skill data: [ESCO](https://esco.ec.europa.eu) (European Skills, Competences,
Qualifications and Occupations) v1.2.1, © European Union. Reuse is authorised provided the source is
acknowledged.

Job demands (`data/demands.json`, rebuilt by `pnpm demands` from the O\*NET database unzipped into
`raw/onet/` and the ESCO–O\*NET crosswalk; see [ADR 0003](docs/adr/0003-demands-from-onet.md)):
this project includes information from the [O\*NET 31.0 Database](https://www.onetcenter.org/database.html)
by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under the
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license. O\*NET® is a trademark of USDOL/ETA.
Pályatérkép has modified all or some of this information. USDOL/ETA has not approved, endorsed, or
tested these modifications.

## License

The code is under the [MIT License](LICENSE). The ESCO and O\*NET data keep their own terms, above.
