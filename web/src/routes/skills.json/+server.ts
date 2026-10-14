import { skillLabels } from "#lib/server/data.ts";

export const prerender = true;

/** Hungarian names of the ESCO skills the roles need; the browser loads them for gap lists. */
export const GET = () => Response.json(skillLabels());
