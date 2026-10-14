// A role note: YAML frontmatter that is the data (docs/vault.md), then a Hungarian body for reading.

import { parse, stringify } from "yaml";
import { z } from "zod";

export const Level = z.number().int().min(1).max(5);
export const Track = z.enum(["individual", "management"]);
export type Track = z.infer<typeof Track>;

/** Written quoted, "[[id]]", so Obsidian shows it as a link in the properties view. */
const Link = z.string().regex(/^\[\[[^\]|#]+\]\]$/u, "a wikilink: [[id]]");

export const Role = z.strictObject({
  curated: z.boolean(),
  occupation: z.string().startsWith("http://data.europa.eu/esco/occupation/"),
  label: z.string().min(1),
  level: Level,
  track: Track,
  branch: z.string().min(1),
  subBranch: z.string().min(1),
  skills: z.array(z.string().startsWith("http://data.europa.eu/esco/skill/")).min(1),
  lateral: z.array(Link),
  progression: z.array(Link).optional(),
});
export type Role = z.infer<typeof Role>;

export interface Note {
  frontmatter: unknown;
  body: string;
}

export const link = (id: string) => `[[${id}]]`;
export const linkTarget = (link: string) => link.slice(2, -2);

/** A note without a readable frontmatter block has `frontmatter: undefined`. */
export function readNote(text: string): Note {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u.exec(text);
  if (!match) return { frontmatter: undefined, body: text };
  try {
    return { frontmatter: parse(match[1] ?? ""), body: match[2] ?? "" };
  } catch {
    return { frontmatter: undefined, body: text };
  }
}

export function writeNote(role: Role, body: string): string {
  return `---\n${stringify(role, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

/** A file name from Hungarian text: "Szoftverfejlesztő" → "szoftverfejleszto". */
export const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
