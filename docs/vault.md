# The role vault

`vault/` holds one Markdown note per role. It is the data the map and the CV reading are built
from: the frontmatter is the data, the body only renders it in Hungarian for a person reading the
vault in Obsidian. Terms are defined in the [glossary](glossary.md).

## A note

The file name, without `.md`, is the role's id. Ids are unique across the vault, subfolders
included, because Obsidian links by name. An uncurated role's id is the slug of its occupation's
Hungarian ESCO label (`szakacs`); where two occupations share a label, both get their ESCO code
appended (`pincemester-6112-4`).

| Key           | Type                          | Meaning                                                                                                                   |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `curated`     | boolean                       | `true`: a person checked the note, and the generator never touches it. `false`: generated; nothing in it is checked.      |
| `occupation`  | ESCO occupation URI           | The occupation this role is a level of. Join with ESCO for its English label, alternative labels, description and code.   |
| `label`       | string, Hungarian             | The role's name. For an uncurated role, the occupation's ESCO label as it is (often lower case).                          |
| `level`       | integer 1–5                   | The role's level (glossary, Levels). Uncurated: proposed by a language model from the occupation's title and description. |
| `track`       | `individual` \| `management`  | The role's track: `individual` szakértői, `management` vezetői. Uncurated: proposed with the level.                       |
| `branch`      | id from `data/branches.json`  | The main branch (fő ág).                                                                                                  |
| `subBranch`   | id from `data/branches.json`  | The sub-branch (kisebb ág), always one of `branch`'s.                                                                     |
| `skills`      | ESCO skill URIs, at least one | The skills the role needs. Uncurated: the occupation's essential ESCO skills (ADR 0002), sorted.                          |
| `lateral`     | wikilinks `"[[id]]"`          | Lateral edges, strongest first. Possibly empty.                                                                           |
| `progression` | wikilinks `"[[id]]"`          | Optional; only curated notes have it. Edges to roles one step further out.                                                |

No other key is allowed; adding one is a schema change in `src/vault/note.ts` and here.

What a reader can rely on, because `pnpm vault:lint` checks it in `pnpm check`:

- every note fits the schema above, and ids are unique;
- every wikilink, in the frontmatter or the body, leads to a note;
- `branch` and `subBranch` exist in the branch table and belong together;
- with ESCO built (`pnpm esco`): every `occupation` and skill exists in ESCO, and every occupation
  has exactly one uncurated role, unless curated roles cover it, in which case it has none.

Edges are undirected. A generated note lists every lateral edge it takes part in, so between two
generated roles an edge appears on both notes. A curated note keeps its own `lateral` and
`progression` lists, and a generated note may link to it without the link being returned. Read
the edge set as the union of all notes' lists.

## Lateral edges

Computed between every pair of roles (generated and curated) of different occupations whose
levels are at most 1 apart. The score is the IDF-weighted Jaccard index of their `skills`: the
summed weight of the shared skills over the summed weight of all their skills, a skill's weight
being `ln(roles / roles needing it)`. A skill nearly every role lists, like „személyzetet irányít”,
weighs little, so it does not link unrelated work. Pairs scoring at least 0.12 are taken strongest
first while both roles have fewer than 6 edges. The two numbers are `LATERAL_MIN` and
`LATERAL_CAP` in `src/vault/generate.ts`.

## Generated and curated notes

The generator owns exactly the notes whose frontmatter says `curated: false`. It rewrites them on
every run and deletes the ones it no longer generates. Every other file, curated or unreadable, it
never writes or deletes, and it does not give a generated note the name of such a file.

To curate a role, set `curated: true` and edit the note; from then on it is a person's. An
occupation with at least one curated role (by `occupation`) gets no uncurated role; its old one is
deleted on the next run. A ladder is curated by adding its roles as curated notes, in a subfolder
if that reads better.

## Regenerating

```sh
pnpm esco      # raw/esco/esco.json from the ESCO CSV packages
pnpm propose   # level and track for every occupation without one in data/proposals.json
pnpm vault     # rewrite the generated notes
pnpm vault:lint
```

`pnpm propose` runs `claude -p` on the subscription with the Sonnet model, 40 occupations a call,
and only for ESCO codes `data/proposals.json` does not have yet; the file is committed, so a rerun
of the vault makes no model call. To re-propose an occupation, delete its line. The prompt is
`PROMPT` in `src/vault/propose.ts`.

The proposed levels are honest only to about one step. Shifting the batch boundaries by 20
occupations changed the level of 12.4% of 800 occupations with Sonnet (16.5% with Haiku), never by
more than one step: many titles sit genuinely between two adjacent levels. That is why uncurated
levels are marked unchecked; curated ladders set the real ones.

`pnpm vault` is deterministic: a second run writes nothing.
