export const LANGS = ["hu", "en"] as const;
export type Lang = (typeof LANGS)[number];
export type Text = Record<Lang, string>;
export type Labels = Record<Lang, string[]>;

/** An ISCO-08 group; the code length is its depth: 1 major, 2 sub-major, 3 minor, 4 unit. */
export interface IscoGroup {
  code: string;
  label: Text;
}

export interface Occupation {
  uri: string;
  /** ESCO code, the ISCO unit group plus a path: `2512.4.1`. */
  code: string;
  isco: string;
  label: Text;
  altLabels: Labels;
  description: Text;
  /** Skill URIs. */
  essential: string[];
  optional: string[];
}

export interface Skill {
  uri: string;
  /** `skill/competence` or `knowledge`; ESCO leaves a few empty. */
  skillType: string;
  reuseLevel: string;
  label: Text;
  altLabels: Labels;
  description: Text;
}

export interface Esco {
  version: string;
  iscoGroups: IscoGroup[];
  occupations: Occupation[];
  skills: Skill[];
}
