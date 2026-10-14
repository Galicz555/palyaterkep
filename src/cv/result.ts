// What reading a CV against the map produces; the map and the list view render it. Terms as in
// docs/glossary.md. Role ids are vault note names; skills are ESCO skill URIs.

export interface CvResult {
  /** Roles the CV shows the person has worked in, with the CV text that shows it. */
  held: { role: string; evidence: string[] }[];
  /** Roles not held whose skills the CV shows at or above the threshold; coverage is 0–1. */
  covered: { role: string; coverage: number }[];
  /** Roles one edge away from a held or covered role, with the skills the CV does not show. */
  reachable: { role: string; from: string; edge: "lateral" | "progression"; gap: string[] }[];
  /** ESCO skills the CV shows, each with the CV text that shows it. */
  skills: { uri: string; evidence: string[] }[];
}
