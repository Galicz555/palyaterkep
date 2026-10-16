# Glossary

One name per concept, used the same way in the schema, the code and the docs. Code and schema are
English; the product text and the nodes are Hungarian. A new concept gets its row here before it
gets a name in code.

## The map

| Code / schema | Magyar         | Meaning                                                                                                                                                                                                                                             |
| ------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `occupation`  | foglalkozás    | A kind of work as ESCO defines it, independent of seniority: „szoftverfejlesztő”, „szakács”.                                                                                                                                                        |
| `level`       | szint          | How far along a career a role sits, on one scale for every occupation (see Levels). Shown as the distance from the centre of the map in most layouts.                                                                                               |
| `role`        | szerep         | One node of the map: an occupation at one level, one `.md` file. „Junior szoftverfejlesztő”, „Medior szoftverfejlesztő”. An occupation that is itself a step of a ladder („sous-chef”) is a single role at its own level.                           |
| `skill`       | készség        | A skill or knowledge concept from ESCO. A role lists the skills it needs as data; skills are never nodes.                                                                                                                                           |
| `branch`      | ág             | A field of work (IT, egészségügy, vendéglátás…), drawn as one angular sector of the disc, and as a colour in the layouts that place roles by their demands. Grouped by field, never by skill level. Branches nest: a fő ág splits into kisebb ágak. |
| `subBranch`   | kisebb ág      | A narrower field inside a fő ág („Szoftver- és webfejlesztés” in IT), drawn as a slice of its sector. Every occupation belongs to exactly one.                                                                                                      |
| `track`       | pályatípus     | Whether a role leads people or does the work: `individual` (szakértői, an individual contributor however senior) or `management` (vezetői, leading people is the core of the job). Shown as a brighter, slightly larger point, in every layout.     |
| `axis`        | tengely        | A spatial dimension of a layout: on the disc level is the radius and branch the angle; the other layouts say theirs (see `layout`). Never used for grouping; that is `branch`.                                                                      |
| `progression` | előrelépés     | An edge from a role to one further out: the same work at a higher level, or the next step of a ladder.                                                                                                                                              |
| `lateral`     | váltás         | An edge between roles in different occupations at a similar level, based on the skills they share.                                                                                                                                                  |
| `ladder`      | létra          | The roles of one occupation, or of a chain of occupations, linked by progression edges, each level with its own skill list. The unit of curation.                                                                                                   |
| `demands`     | terhelés       | How physical, mental and emotional an occupation's work is: three percentile ranks among the scored occupations, from O\*NET ratings (ADR 0003). Shared by every role of the occupation; absent where O\*NET has no data.                           |
| `exposure`    | MI-érintettség | How much of an occupation's tasks generative AI could do: the ILO's gradient 1–4 for its ISCO unit group, absent for minimal or none (ADR 0004). Gradient 4 is shown as replaceable (kiváltható).                                                   |
| `curated`     | ellenőrzött    | A role or edge a person has checked. Everything else on the map is generated, and shown as such.                                                                                                                                                    |

## The layouts

| Code / schema | Magyar     | Meaning                                                                                                                                                                           |
| ------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mix`         | arány      | A role's three `demands` as shares of their sum: where it sits on the triangle between the three. A role without data is placed in the middle and drawn so it reads as "no data". |
| `magnitude`   | mérték     | A role's three `demands` averaged: how much it asks of a person at all, whatever the mix.                                                                                         |
| `layout`      | elrendezés | One way to place every role on the map, chosen from a dropdown and kept in the address (`?elrendezes=`). The map morphs from one layout to the next.                              |

## Levels

| Code / schema | Magyar     | Meaning                                            |
| ------------- | ---------- | -------------------------------------------------- |
| 1             | belépő     | Learning the work under guidance.                  |
| 2             | önálló     | Does the everyday work alone.                      |
| 3             | tapasztalt | Handles the hard cases and helps others with them. |
| 4             | kiemelt    | Shapes how a team or a field of the work is done.  |
| 5             | stratégiai | Shapes how an organisation or a profession works.  |

## Reading a CV against the map

| Code / schema | Magyar     | Meaning                                                                                                                                                                                      |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `held`        | betöltött  | A role the CV shows the person has worked in, at the level its job title, or failing that its years, shows.                                                                                  |
| `covered`     | lefedett   | A role the person has not held, but whose needed skills the CV shows above the coverage threshold. A held role's skills count as shown, towards roles no higher than the highest level held. |
| `reachable`   | elérhető   | A role one edge away from a held or covered role.                                                                                                                                            |
| `gap`         | hiánylista | The skills a reachable role needs that the CV does not show, leaving out those the held role it is reached from already needs. The advice the map gives.                                     |
