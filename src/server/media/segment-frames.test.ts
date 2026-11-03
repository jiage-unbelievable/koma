import { it, expect } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpeg from "ffmpeg-static";
import { runCommand } from "./video.js";
import { extractSegmentFrames, createContactSheet } from "./segment-frames.js";
it("extracts the end of a later chapter with real global timestamps, not just early scenes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "koma-segment-frame-"));
  try {
    const video = join(dir, "input.mp4");
    await runCommand(ffmpeg as unknown as string, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=4:size=320x240:rate=25",
      "-pix_fmt",
      "yuv420p",
      video,
    ]);
    const frames = await extractSegmentFrames(
      video,
      join(dir, "frames"),
      2000,
      4000,
      1,
    );
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(frames.every((f) => f.atMs >= 2000 && f.atMs < 4000)).toBe(true);
    expect(Math.max(...frames.map((f) => f.atMs))).toBeGreaterThanOrEqual(3800);
    expect(
      (await stat(await createContactSheet(join(dir, "frames"), frames))).size,
    ).toBeGreaterThan(0);
    for (const f of frames)
      expect(
        (await stat(join(dir, "frames", f.filename))).size,
      ).toBeGreaterThan(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
