import { describe, expect, it } from "vitest";
import { acceptAnswer, formatProposals, Proposals, type Proposal } from "../src/vault/propose.ts";

describe("proposals", () => {
  it("accept each code of the batch once and drop the rest", () => {
    const answer = {
      roles: [
        { code: "1", level: 2, track: "individual" as const },
        { code: "2", level: 3, track: "management" as const },
        { code: "2", level: 4, track: "management" as const },
        { code: "9", level: 1, track: "individual" as const },
      ],
    };
    expect(acceptAnswer(["1", "2", "3"], answer)).toEqual({
      "1": { level: 2, track: "individual" },
    });
  });

  it("format one sorted entry per line that parses back", () => {
    const p: Record<string, Proposal> = {
      "9412.1": { level: 1, track: "individual" },
      "1112.6": { level: 4, track: "management" },
    };
    const text = formatProposals(p);
    expect(text).toBe(
      '{\n  "1112.6": { "level": 4, "track": "management" },\n  "9412.1": { "level": 1, "track": "individual" }\n}\n',
    );
    expect(Proposals.parse(JSON.parse(text))).toEqual(p);
  });
});
