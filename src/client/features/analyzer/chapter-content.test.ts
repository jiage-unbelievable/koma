import { expect, it } from "vitest";
import { chapterFrames, chapterLines, chapterOpeningTime } from "./chapter-content.js";

it("opens at the current playback position only when it belongs to the selected chapter", () => {
  const chapter = { title: "Second", summary: "", startMs: 4000, endMs: 8000 };
  expect(chapterOpeningTime(chapter, 6543)).toBe(6543);
  expect(chapterOpeningTime(chapter, 4000)).toBe(4000);
  expect(chapterOpeningTime(chapter, 8000)).toBe(4000);
  expect(chapterOpeningTime(chapter, 0)).toBe(4000);
});
it("keeps chapter content scoped for indexed results and legacy results without evidence indices", () => {
  const chapter = { title: "Second", summary: "", startMs: 4000, endMs: 8000 };
  const frames = [{ filename: "previous", atMs: 3999, url: "a" }, { filename: "own", atMs: 5000, url: "b" }, { filename: "next", atMs: 8000, url: "c" }];
  expect(chapterFrames(chapter, frames).map(f => f.filename)).toEqual(["own"]);
  expect(chapterFrames({ ...chapter, frameFilenames: ["previous", "next"] }, frames)).toEqual([]);
  const lines = [{ startMs: 0, endMs: 4000, text: "Previous" }, { startMs: 3500, endMs: 5000, text: "Overlap" }, { startMs: 5000, endMs: 7000, text: "Own" }, { startMs: 8000, endMs: 9000, text: "Next" }];
  expect(chapterLines(chapter, lines).map(l => l.text)).toEqual(["Overlap", "Own"]);
  expect(chapterLines({ ...chapter, transcriptIndices: [2] }, lines).map(l => l.text)).toEqual(["Own"]);
});
