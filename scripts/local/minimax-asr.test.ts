import { it, expect } from "vitest";
import { sentenceSegments, parseAudioRequest } from "./minimax-asr.mjs";
it("preserves complete wording while grouping word timestamps into readable sentences", () => {
  const segments = [
    { start: 0, end: 0.3, text: "Hello ", speaker: "S1" },
    { start: 0.3, end: 0.8, text: "world. ", speaker: "S1" },
    { start: 1, end: 1.5, text: "尾声。", speaker: "S1" },
  ];
  expect(sentenceSegments({ text: "Hello world. 尾声。", segments })).toEqual([
    { start: 0, end: 0.8, text: "Hello world.", speaker: "S1" },
    { start: 1, end: 1.5, text: "尾声。", speaker: "S1" },
  ]);
});
it("does not accept text without real aligned segments", () => {
  expect(() => sentenceSegments({ text: "spoken words" })).toThrow();
  expect(sentenceSegments({ text: "", segments: [] })).toEqual([]);
  expect(() =>
    sentenceSegments({ segments: [{ start: -1, end: 2, text: "bad" }] }),
  ).toThrow();
});
it("accepts only the fixed ASR model and rebuilds a non-streaming word-aligned upstream form", async () => {
  const form = new FormData();
  form.set("model", "asr-1.0");
  form.set("file", new Blob(["audio"]), "sample.mp3");
  form.set("stream", "true");
  const req = new Request("http://local", { method: "POST", body: form });
  const result = await parseAudioRequest(
    Buffer.from(await req.arrayBuffer()),
    req.headers.get("content-type"),
  );
  expect(result.get("model")).toBe("asr-1.0");
  expect(result.get("response_format")).toBe("verbose_json");
  expect(result.get("timestamp_level")).toBe("word");
  expect(result.get("stream")).toBe("false");
});

it("rejects aligned output that omits part of the complete ASR text", () => {
  expect(() =>
    sentenceSegments({
      text: "hello ending",
      segments: [{ start: 0, end: 1, text: "hello" }],
    }),
  ).toThrow("complete transcript");
});
