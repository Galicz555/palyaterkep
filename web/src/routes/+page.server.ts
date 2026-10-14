import { mapData } from "#lib/server/data.ts";

export const load = () => ({ map: mapData() });
