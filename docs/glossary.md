# Glossary

One name per concept, used the same way in the schema, the code and the docs. Code and schema are
English; the product text and the nodes are Hungarian. A new concept gets its row here before it
gets a name in code.

## The map

| Code / schema | Magyar      | Meaning                                                                                                                                                                                                                   |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `occupation`  | foglalkozás | A kind of work as ESCO defines it, independent of seniority: „szoftverfejlesztő”, „szakács”.                                                                                                                              |
| `level`       | szint       | How far along a career a role sits, on one scale for every occupation (see Levels). Shown as the distance from the centre of the map.                                                                                     |
| `role`        | szerep      | One node of the map: an occupation at one level, one `.md` file. „Junior szoftverfejlesztő”, „Medior szoftverfejlesztő”. An occupation that is itself a step of a ladder („sous-chef”) is a single role at its own level. |
| `skill`       | készség     | A skill or knowledge concept from ESCO. A role lists the skills it needs as data; skills are never nodes.                                                                                                                 |
| `branch`      | ág          | A field of work (IT, egészségügy, vendéglátás…), drawn as one angular sector of the map. Grouped by field, never by skill level. Branches nest: a fő ág splits into kisebb ágak.                                          |
| `subBranch`   | kisebb ág   | A narrower field inside a fő ág („Szoftver- és webfejlesztés” in IT), drawn as a slice of its sector. Every occupation belongs to exactly one.                                                                            |
| `track`       | pályatípus  | Whether a role leads people or does the work: `individual` (szakértői, an individual contributor however senior) or `management` (vezetői, leading people is the core of the job). Shown as height on the map.            |
| `axis`        | tengely     | A spatial dimension of the map: level is the radius, branch the angle, track the height. Never used for grouping; that is `branch`.                                                                                       |
| `progression` | előrelépés  | An edge from a role to one further out: the same work at a higher level, or the next step of a ladder.                                                                                                                    |
| `lateral`     | váltás      | An edge between roles in different occupations at a similar level, based on the skills they share.                                                                                                                        |
| `ladder`      | létra       | The roles of one occupation, or of a chain of occupations, linked by progression edges, each level with its own skill list. The unit of curation.                                                                         |
| `curated`     | ellenőrzött | A role or edge a person has checked. Everything else on the map is generated, and shown as such.                                                                                                                          |

## Levels

| Code / schema | Magyar     | Meaning                                            |
| ------------- | ---------- | -------------------------------------------------- |
| 1             | belépő     | Learning the work under guidance.                  |
| 2             | önálló     | Does the everyday work alone.                      |
| 3             | tapasztalt | Handles the hard cases and helps others with them. |
| 4             | kiemelt    | Shapes how a team or a field of the work is done.  |
| 5             | stratégiai | Shapes how an organisation or a profession works.  |

## Reading a CV against the map

| Code / schema | Magyar     | Meaning                                                                                                     |
| ------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `held`        | betöltött  | A role the CV shows the person has worked in, at the level its job title, or failing that its years, shows. |
| `covered`     | lefedett   | A role the person has not held, but whose needed skills the CV shows above the coverage threshold.          |
| `reachable`   | elérhető   | A role one edge away from a held or covered role.                                                           |
| `gap`         | hiánylista | The skills a reachable role needs that the CV does not show. The advice the map gives.                      |
