import { error } from "@sveltejs/kit";
import { roleDetail, roleIds } from "#lib/server/data.ts";
import type { EntryGenerator, PageServerLoad } from "./$types";

// Every role is its own prerendered page: „Szakács – mi kell hozzá”.
export const entries: EntryGenerator = () => roleIds().map((id) => ({ id }));

export const load: PageServerLoad = ({ params }) => {
  const role = roleDetail(params.id);
  if (!role) error(404, "Nincs ilyen szerep.");
  return { role };
};
