import { escoVersion } from "#lib/server/data.ts";

export const load = () => ({ esco: escoVersion() });
