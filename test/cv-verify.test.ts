import { describe, expect, it } from "vitest";
import { z } from "zod";
import { askVerified, findQuote, fold, type Ask, type Prompt } from "../src/cv/verify.ts";

const CV = fold(
  "Szenior szoftverfejlesz-\ntő, Példa Kft.\n2019. március – jelenleg\nVezettem egy 5 fős csapatot, Kubernetes-\nre költöztünk.",
);

describe("findQuote", () => {
  it("returns the CV's own text, from the first to the last letter or digit", () => {
    expect(findQuote("Példa Kft.", CV)).toBe("Példa Kft");
  });

  it("matches across a line-break hyphenation", () => {
    expect(findQuote("Szenior szoftverfejlesztő", CV)).toBe("Szenior szoftverfejlesz- tő");
    expect(findQuote("Kubernetesre költöztünk", CV)).toBe("Kubernetes- re költöztünk");
  });

  it("ignores diacritic variants, case and punctuation spacing", () => {
    expect(findQuote("PÉLDA KFT", CV)).toBe("Példa Kft");
    expect(findQuote("Vezettem egy 5 fõs csapatot", CV)).toBe("Vezettem egy 5 fős csapatot");
    expect(findQuote("2019. marcius - jelenleg", CV)).toBe("2019. március – jelenleg");
  });

  it("finds decomposed diacritics in the CV and keeps them whole", () => {
    const decomposed = fold("Ápoló".normalize("NFD"));
    expect(findQuote("ápoló", decomposed)).toBe("Ápoló".normalize("NFD"));
  });

  it("keeps a closing bracket or quote that the match opened", () => {
    const cv = fold("Battery Commander (Officer), 2012 – 2019. Projekt „Térkép” (2024)");
    expect(findQuote("Battery Commander (Officer", cv)).toBe("Battery Commander (Officer)");
    expect(findQuote("Projekt „Térkép", cv)).toBe("Projekt „Térkép”");
    expect(findQuote("Officer", cv)).toBe("Officer");
  });

  it("does not find a fabricated quote", () => {
    expect(findQuote("Vezettem egy 50 fős csapatot", CV)).toBeUndefined();
    expect(findQuote("Senior software developer", CV)).toBeUndefined();
  });

  it("does not accept a quote with almost no letters", () => {
    expect(findQuote("t", CV)).toBeUndefined();
    expect(findQuote(" – ", CV)).toBeUndefined();
  });
});

describe("askVerified", () => {
  const prompt: Prompt<{ quotes: string[] }> = {
    name: "test",
    system: "",
    user: "CV",
    schema: z.object({ quotes: z.array(z.string()) }),
  };
  const check = ({ quotes }: { quotes: string[] }) => ({
    kept: quotes.filter((q) => findQuote(q, CV)),
    problems: quotes.filter((q) => !findQuote(q, CV)).map((q) => `"${q}" is not in the CV`),
  });
  const replay = (...answers: unknown[]) => {
    const seen: string[] = [];
    const ask: Ask = async (p) => {
      seen.push(p.user);
      return answers.shift();
    };
    return { ask, seen };
  };

  it("drops a fabricated quote after one corrective retry that names it", async () => {
    const { ask, seen } = replay(
      { quotes: ["Példa Kft.", "Google Inc."] },
      { quotes: ["Példa Kft.", "Google Inc."] },
    );
    const result = await askVerified(ask, prompt, check);
    expect(result.kept).toEqual(["Példa Kft."]);
    expect(result.problems).toEqual(['"Google Inc." is not in the CV']);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('- "Google Inc." is not in the CV');
  });

  it("asks once when every claim holds", async () => {
    const { ask, seen } = replay({ quotes: ["Példa Kft."] });
    expect((await askVerified(ask, prompt, check)).kept).toEqual(["Példa Kft."]);
    expect(seen).toHaveLength(1);
  });

  it("keeps the corrected answer", async () => {
    const { ask } = replay({ quotes: ["Google Inc."] }, { quotes: ["Példa Kft."] });
    expect(await askVerified(ask, prompt, check)).toEqual({ kept: ["Példa Kft."], problems: [] });
  });

  it("throws when no answer fits the schema", async () => {
    const { ask } = replay({ quotes: "x" }, { nope: 1 });
    await expect(askVerified(ask, prompt, check)).rejects.toThrow(/does not fit the schema/);
  });
});
