// The product's Hungarian words (docs/glossary.md, Magyar column) and small text helpers.

import type { Level } from "./model.ts";

export const LEVEL_NAMES: Record<Level, string> = {
  1: "belépő",
  2: "önálló",
  3: "tapasztalt",
  4: "kiemelt",
  5: "stratégiai",
};

export const levelText = (level: Level) => `${level}. szint (${LEVEL_NAMES[level]})`;
export const trackText = (management: boolean) => (management ? "vezetői" : "szakértői");

/** Uncurated labels are ESCO's, lower case: „szoftverfejlesztő” → „Szoftverfejlesztő”. */
export const capitalise = (text: string) => text.charAt(0).toLocaleUpperCase("hu") + text.slice(1);

export const UNCHECKED = "gépi javaslat, nem ellenőrzött";
export const CHECKED = "ellenőrzött";

/** For searching: „Szakács” and „szakacs” match each other. */
export const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("hu");
