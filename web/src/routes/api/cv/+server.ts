import { liveDeps } from "#lib/server/cv-live.ts";
import { handleCv } from "#lib/server/cv-route.ts";
import type { RequestHandler } from "./$types";

// The one route that needs a server (src/routes/+layout.ts prerenders everything else).
export const prerender = false;

export const POST: RequestHandler = ({ request, getClientAddress }) =>
  handleCv(request, getClientAddress(), liveDeps());
