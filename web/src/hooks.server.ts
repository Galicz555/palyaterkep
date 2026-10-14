import { building } from "$app/env";
import { warm } from "#lib/server/cv-live.ts";

// Build the CV reader while the server starts, not on the first person's upload.
if (!building) warm();
