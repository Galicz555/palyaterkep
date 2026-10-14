import { MAX_CV_CHARS } from "../../../src/cv/read.ts";
import { mapData } from "#lib/server/data.ts";

export const load = () => ({ map: mapData(), maxChars: MAX_CV_CHARS });
