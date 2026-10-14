// The layouts the map can show, by name: what the dropdown, the address and the key under the map
// say about each. Where the roles go is in lib/arrange.ts, which the map loads with three.js.

export type LayoutId = "A" | "B" | "C" | "D" | "F" | "G";

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
  /** Whether colour is the mix of demands, with its own key, instead of the branch. */
  demandColors?: true;
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
    intro:
      "Minden szerep egy pont: a szög a szakterület, a távolság a szint, a magasság a választott terhelés.",
    key: [
      ["Szög", "ág"],
      ["Távolság", "szint, kívül a magasabb"],
      ["Magasság", "a választott terhelés, fent a nagyobb"],
    ],
    byBranch: true,
  },
  {
    id: "C",
    label: "C – Háromszög-hasáb",
    intro:
      "Minden szerep egy pont: a háromszög alapon a helye a három terhelés aránya, a magasság a szint, a szín az ág.",
    key: [
      ["Helye az alapon", "a három terhelés aránya"],
      ["Magasság", "szint, fent a magasabb"],
      ["Szín", "ág"],
    ],
    byBranch: false,
  },
  {
    id: "D",
    label: "D – Tetraéder",
    intro:
      "Minden szerep egy pont a tetraéderben: a fizikai, szellemi és érzelmi terhelés csúcsa között a terhelés aránya, a negyedik, „könnyű” csúcs felé pedig annál közelebb, minél kevésbé megterhelő a szerep; a méret a szint, a szín az ág.",
    key: [
      ["Helye", "a három terhelés aránya, és a könnyű csúcs felé: kis terhelés"],
      ["Méret", "szint, nagyobb a magasabb"],
      ["Szín", "ág"],
    ],
    byBranch: false,
  },
  {
    id: "F",
    label: "F – Vonzó köd",
    intro:
      "Minden szerep egy felhőpont, amelyet három vonzó húz: a fizikai, a szellemi és az érzelmi terhelés. Amelyik terhelés a szerepben erősebb, ahhoz húz közelebb, a felhő spirálisan kígyózik; a szint csak enyhén, kis emelkedéssel és mérettel látszik, a szín az ág.",
    key: [
      ["Helye", "a három vonzó közül, amelyik terhelés erősebb, ahhoz közelebb"],
      ["Emelkedés, méret", "szint, csak enyhén"],
      ["Szín", "ág"],
    ],
    byBranch: false,
  },
  {
    id: "G",
    label: "G – Színkeverés",
    intro:
      "Minden szerep egy pont a korongon: a szög a szakterület, a távolság a szint, a szín a három terhelés keveréke (piros a fizikai, lila a szellemi, rózsaszín az érzelmi).",
    key: [
      ["Szög", "ág"],
      ["Távolság", "szint, kívül a magasabb"],
      ["Szín", "a három terhelés keveréke, a különbségek felerősítve"],
    ],
    byBranch: true,
    demandColors: true,
  },
];

/** The three demands in the address, for the layout that lifts the points by one of them. */
export const AXES = ["fizikai", "szellemi", "erzelmi"] as const;
/** Which demand (an index into `AXES`) the address names; the first for anything else. */
export const axisOf = (value: string | null): number => Math.max(0, AXES.indexOf(value as never));

export const DEFAULT_LAYOUT: LayoutId = "A";

/** A layout id from the address, or the default for anything else. */
export const layoutOf = (value: string | null): LayoutId =>
  LAYOUTS.find((l) => l.id === value)?.id ?? DEFAULT_LAYOUT;
