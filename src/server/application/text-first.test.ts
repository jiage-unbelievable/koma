import { beforeEach, afterAll, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const calls = vi.hoisted(() => ({
  asr: 0,
  vision: 0,
  failSecond: false,
  plans: 0,
}));
vi.mock("../media/asr.js", () => ({
  transcribe: vi.fn(async () => {
    calls.asr++;
    return [
      { startMs: 0, endMs: 1500, text: "Opening garden topic." },
      { startMs: 2000, endMs: 3500, text: "Ending exercise topic." },
    ];
  }),
}));
vi.mock("../media/video.js", () => ({
  extractAudioSegments: async () => [
    { filename: "a.mp3", path: "not-uploaded", startMs: 0, endMs: 4000 },
  ],
}));
vi.mock("../media/segment-frames.js", () => ({
  createContactSheet: async (dir: string, frames: { filename: string }[]) =>
    join(dir, frames[0].filename),
  extractSegmentFrames: async (
    _input: string,
    dir: string,
    start: number,
    _end: number,
    index: number,
  ) => {
    await mkdir(dir, { recursive: true });
    return Promise.all(
      [0, 1, 2].map(async (k) => {
        const filename = `seg-${index}-u-${k}.jpg`;
        await writeFile(join(dir, filename), "fixture-image");
        return { filename, atMs: start + k * 100 };
      }),
    );
  },
}));
vi.mock("../analysis/chat-completion.js", () => ({
  requestChatCompletion: async ({
    userContent,
  }: {
    userContent: string | { text?: string }[];
  }) => {
    const prompt =
      typeof userContent === "string" ? userContent : userContent[0].text || "";
    if (prompt.startsWith("你在整理")) {
      calls.plans++;
      return JSON.stringify({
        sections: [
          {
            first: 0,
            last: 0,
            title: "Gardening",
            summary: "Opening garden topic.",
          },
          {
            first: 1,
            last: 1,
            title: "Exercise",
            summary: "Ending exercise topic.",
          },
        ],
      });
    }
    if (Array.isArray(userContent)) {
      calls.vision++;
      if (calls.failSecond && calls.vision === 2)
        throw Error("temporary model outage");
      return JSON.stringify({
        summary: "Combined evidence",
        visualSummary: "Visible picture",
        uncertainties: [],
        frameCaptions: [0, 1, 2].map((index) => ({
          index,
          caption: "frame evidence",
        })),
      });
    }
    if (prompt.startsWith("将这一段的"))
      return JSON.stringify({
        summary: "Combined evidence",
        uncertainties: [],
      });
    if (prompt.startsWith("根据全部原文"))
      return JSON.stringify({ summary: "Garden then exercise." });
    return JSON.stringify({
      title: "Whole video",
      summary: "Opening garden and ending exercise.",
      tags: [],
      hasSubtitles: false,
    });
  },
}));
import { analyzeTextFirst } from "./text-first.js";
import { cloneTextFirstCheckpoint } from "./text-first-cache.js";
import { deleteStoredPrefix } from "../persistence/storage.js";
import type { Job } from "./jobs.js";
const root = await mkdtemp(join(tmpdir(), "koma-text-first-"));
const providers = {
  asr: {
    provider: "openai-compatible" as const,
    apiKey: "test-only-key",
    model: "asr-1.0",
    baseUrl: "http://broker/v1",
  },
  vision: {
    provider: "openai-compatible" as const,
    apiKey: "test-only-key",
    model: "MiniMax-M3.1-Flash",
    baseUrl: "http://broker/v1",
  },
};
async function options(name: string) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const inputPath = join(dir, "input.mp4");
  await writeFile(inputPath, "same-video");
  return {
    inputPath,
    framesDir: join(dir, "frames"),
    audioDir: join(dir, "audio"),
    media: {
      durationMs: 4000,
      hasVideo: true,
      hasAudio: true,
      hasNativeSubtitles: false,
    },
    title: "same title",
    language: "en" as const,
    analysisSpec: {},
    providers,
    onProgress: () => {},
    checkpointPrefix: `koma/jobs/${name}`,
  };
}
beforeEach(() => {
  calls.asr = 0;
  calls.vision = 0;
  calls.plans = 0;
  calls.failSecond = false;
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("LOCAL_STORAGE_PATH", join(root, "storage"));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
it("does ASR and complete text planning before vision, preserving transcript and per-chapter evidence", async () => {
  const result = await analyzeTextFirst(await options("complete"));
  expect(calls.asr).toBe(1);
  expect(calls.plans).toBe(1);
  expect(calls.vision).toBe(2);
  expect(result.pipeline).toBe("text-first-v1");
  expect(result.transcript.at(-1)?.text).toContain("Ending");
  expect(result.chapters).toHaveLength(2);
  expect(result.chapters.flatMap((c) => c.transcriptIndices || [])).toEqual([
    0, 1,
  ]);
  expect(
    result.artifacts?.find((a) => a.name === "transcript.txt")?.content,
  ).toContain("Ending");
  expect(result.frames).toHaveLength(6);
  const manifest = await readFile(
    join(root, "storage/koma/jobs/complete/checkpoints/text-first-v1.json"),
    "utf8",
  );
  expect(manifest).not.toContain("test-only-key");
});
it("resumes only the failed chapter in a new private job, independent of old-job deletion", async () => {
  calls.failSecond = true;
  const first = await options("failed");
  await expect(analyzeTextFirst(first)).rejects.toThrow(
    "temporary model outage",
  );
  expect(calls.asr).toBe(1);
  const next = await options("retry");
  await cloneTextFirstCheckpoint(
    { storagePrefix: first.checkpointPrefix } as Job,
    { storagePrefix: next.checkpointPrefix, dir: join(root, "retry") } as Job,
  );
  await deleteStoredPrefix(first.checkpointPrefix);
  calls.failSecond = false;
  const result = await analyzeTextFirst(next);
  expect(calls.asr).toBe(1);
  expect(calls.plans).toBe(1);
  expect(calls.vision).toBe(3);
  expect(result.chapters).toHaveLength(2);
  expect(result.transcript).toHaveLength(2);
});
it("does not reuse checkpoints when provider configuration changes", async () => {
  const o = await options("changed");
  await analyzeTextFirst(o);
  await analyzeTextFirst({
    ...o,
    providers: {
      ...providers,
      vision: { ...providers.vision, model: "new-model" },
    },
  });
  expect(calls.asr).toBe(2);
});
