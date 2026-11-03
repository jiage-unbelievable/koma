import { it, expect } from "vitest";
import {
  transcriptBatches,
  validateGroups,
  timeSections,
  validateTranscript,
} from "./text-sections.js";
const lines = Array.from({ length: 500 }, (_, i) => ({
  startMs: i * 1000,
  endMs: i * 1000 + 900,
  text: `line-${i} ` + "字".repeat(90),
}));
it("covers every sentence, including the tail beyond 30,000 characters", () => {
  const batches = transcriptBatches(lines);
  expect(batches.length).toBeGreaterThan(3);
  expect(batches.flat()).toEqual(lines.map((_, i) => i));
  expect(batches.at(-1)?.at(-1)).toBe(499);
});
it.each([
  [{ first: 0, last: 0, title: "a", summary: "" }],
  [{ first: 1, last: 2, title: "a", summary: "" }],
  [
    { first: 0, last: 2, title: "a", summary: "" },
    { first: 2, last: 2, title: "b", summary: "" },
  ],
])("rejects omitted or overlapping transcript coverage", (...groups) => {
  expect(() => validateGroups(groups, [0, 1, 2])).toThrow();
});
it("splits long topics, assigns all sentences, and covers the whole timeline", () => {
  const groups = validateGroups(
    [{ first: 0, last: 499, title: "Topic", summary: "Full topic" }],
    lines.map((_, i) => i),
  );
  const sections = timeSections(groups, lines, 520000, 180000);
  expect(sections[0].startMs).toBe(0);
  expect(sections.at(-1)?.endMs).toBe(520000);
  expect(sections.flatMap((s) => s.transcriptIndices)).toEqual(
    lines.map((_, i) => i),
  );
  sections
    .slice(1)
    .forEach((s, i) => expect(s.startMs).toBe(sections[i].endMs));
  expect(sections.every((s) => s.endMs - s.startMs <= 180000)).toBe(true);
});
it("covers long silent videos and stops explicitly if the budget cannot cover the timeline", () => {
  expect(timeSections([], [], 600000, 180000)).toHaveLength(4);
  expect(() => timeSections([], [], 600000, 180000, 2)).toThrow("停止");
});
it("rejects invalid timing instead of inventing alignment", () => {
  expect(() =>
    validateTranscript([{ startMs: 2000, endMs: 1000, text: "bad" }], 3000),
  ).toThrow();
});
