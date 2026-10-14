import { describe, expect, it } from "vitest";
import { parseCsv, readRecords } from "../src/esco/csv.ts";

describe("parseCsv", () => {
  it("keeps commas, line breaks and doubled quotes inside quoted fields", () => {
    const text = 'a,"b, c","line one\nline two","say ""hi"""\n';
    expect(parseCsv(text)).toEqual([["a", "b, c", "line one\nline two", 'say "hi"']]);
  });

  it("treats CRLF as one row break and adds no row for a trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps empty fields, including a trailing one", () => {
    expect(parseCsv("a,,c,\n")).toEqual([["a", "", "c", ""]]);
  });

  it("rejects text that ends inside a quoted field", () => {
    expect(() => parseCsv('a,"open\n')).toThrow("inside a quoted field");
  });
});

describe("readRecords", () => {
  it("strips a byte order mark and keys fields by the header", () => {
    expect(readRecords('﻿uri,label\nx:1,"Szakács, séf"\n')).toEqual([
      { uri: "x:1", label: "Szakács, séf" },
    ]);
  });

  it("rejects a record whose field count differs from the header", () => {
    expect(() => readRecords("a,b\n1,2\n3\n")).toThrow("record 2: 1 fields, header has 2");
  });
});
