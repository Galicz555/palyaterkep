// The map's "erősen kiváltható" switch: whether the roles the ILO puts in gradient 4 (ADR 0004) are
// shown as burnt out. It lives in the address (`?kivaltas=1`) so a link reproduces it, and in memory
// so it carries from the map to the list by client navigation.

import { replaceState } from "$app/navigation";
export const REPLACEABLE_PARAM = "kivaltas";
export const REPLACEABLE_LABEL = "erősen kiváltható";
/** What the card and the tip say about such a role. */
export const REPLACEABLE_NOTE =
  "Erősen kiváltható: az ILO szerint a feladatainak szinte mindegyikét végezheti generatív MI (4. gradiens). Az index a mai feladatokat méri, nem a foglalkoztatást.";

let on = $state(false);

export const replaceable = {
  get on() {
    return on;
  },
  set(next: boolean) {
    on = next;
    this.write();
  },
  /** On arrival: the address wins when it names the switch, else what the last page left. */
  read() {
    const asked = new URLSearchParams(location.search).get(REPLACEABLE_PARAM);
    if (asked !== null) on = asked === "1";
    else if (on) this.write();
  },
  write() {
    const url = new URL(location.href);
    if (on) url.searchParams.set(REPLACEABLE_PARAM, "1");
    else url.searchParams.delete(REPLACEABLE_PARAM);
    replaceState(url, {});
  },
};
