// What the build hands to the browser: the whole map in one compact object, and one role's page.
// Terms as in docs/glossary.md. Role ids are vault note names.

export type Level = 1 | 2 | 3 | 4 | 5;

export interface MapRole {
  id: string;
  /** The vault label as it is: an uncurated role's is the ESCO label, often lower case. */
  label: string;
  level: Level;
  /** `track: management`; false is `individual`. */
  management: boolean;
  curated: boolean;
  /** Index into `MapData.branches`. */
  branch: number;
  /** Index into that branch's `subBranches`. */
  sub: number;
}

export interface MapBranch {
  id: string;
  label: string;
  subBranches: { id: string; label: string }[];
}

export interface MapData {
  /** In the order around the map. */
  branches: MapBranch[];
  /** Ordered by branch, sub-branch, level, then label. */
  roles: MapRole[];
  /** Pairs of indices into `roles`, each pair once. */
  lateral: [number, number][];
  /** From a role to one further out; only curated notes have them. */
  progression: [number, number][];
}

export interface RoleLink {
  id: string;
  label: string;
  level: Level;
}

export interface RoleDetail extends RoleLink {
  management: boolean;
  curated: boolean;
  branch: { id: string; label: string };
  subBranch: { id: string; label: string };
  /** ESCO's description of the occupation, Hungarian. */
  description: string;
  /** ESCO code, `2512.4`. */
  code: string;
  skills: { key: string; label: string; knowledge: boolean }[];
  lateral: RoleLink[];
  progression: RoleLink[];
}

const SKILL_PREFIX = "http://data.europa.eu/esco/skill/";

/** An ESCO skill URI without its common prefix; what the pages and `/skills.json` key on. */
export const skillKey = (uri: string): string =>
  uri.startsWith(SKILL_PREFIX) ? uri.slice(SKILL_PREFIX.length) : uri;
