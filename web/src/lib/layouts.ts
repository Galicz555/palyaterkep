// The layouts the map can show, by name: what the dropdown, the address and the key under the map
// say about each. Where the roles go is in lib/arrange.ts, which the map loads with three.js.

export type LayoutId = "A" | "B";

export interface LayoutInfo {
  id: LayoutId;
  /** The dropdown's text. */
  label: string;
  /** The page's one-sentence reading of the map. */
  intro: string;
  /** What each visual channel carries, for the key under the map. */
  key: [channel: string, meaning: string][];
  /** Whether the branch is a place on this map, with its own names around it; else a colour legend. */
  byBranch: boolean;
}

export const LAYOUTS: readonly LayoutInfo[] = [
  {
    id: "A",
    label: "A – Terhelés-gömb",
    intro:
      "Minden szerep egy pont: az irány a fizikai, szellemi és érzelmi terhelés aránya, a távolság a szint, a szín az ág, a méret a terhelés mértéke.",
    key: [
      ["Irány", "a három terhelés aránya"],
      ["Távolság", "szint, kívül a magasabb"],
      ["Szín", "ág"],
      ["Méret", "a három terhelés átlaga"],
    ],
    byBranch: false,
  },
  {
    id: "B",
    label: "B – Nézőpontváltó",
    intro: "Minden szerep egy pont: a szög a szakterület, a távolság a szint.",
    key: [
      ["Szög", "ág"],
      ["Távolság", "szint, kívül a magasabb"],
    ],
    byBranch: true,
  },
];

export const DEFAULT_LAYOUT: LayoutId = "A";

/** A layout id from the address, or the default for anything else. */
export const layoutOf = (value: string | null): LayoutId =>
  LAYOUTS.find((l) => l.id === value)?.id ?? DEFAULT_LAYOUT;
