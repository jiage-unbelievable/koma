import { mkdir, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { config } from "../config/config.js";
import { runCommand, parseShowinfoTimes } from "./video.js";
import type { Frame } from "../application/jobs.js";
export async function extractSegmentFrames(
  input: string,
  dir: string,
  startMs: number,
  endMs: number,
  index: number,
  signal?: AbortSignal,
): Promise<Frame[]> {
  await mkdir(dir, { recursive: true });
  const bin = process.env.FFMPEG_PATH || (ffmpeg as unknown as string);
  const span = Math.max(1, endMs - startMs),
    prefix = `seg-${index}`;
  // Cover the whole interval; record actual decoded frame timestamps rather than requested seeks.
  const times = [0.02, 0.5, 0.98].map((r) =>
    Math.round(startMs + Math.min(span - 1, span * r)),
  );
  const frames: Frame[] = [];
  for (let i = 0; i < times.length; i++) {
    const filename = `${prefix}-u-${i}.jpg`;
    let actual: number | undefined;
    for (const seek of [times[i], startMs]) {
      await rm(join(dir, filename), { force: true });
      const snap = await runCommand(
        bin,
        [
          "-hide_banner",
          "-loglevel",
          "info",
          "-y",
          "-copyts",
          "-start_at_zero",
          "-ss",
          String(seek / 1000),
          "-i",
          input,
          "-frames:v",
          "1",
          "-vf",
          `scale=${config.frameWidth}:-2,showinfo`,
          join(dir, filename),
        ],
        signal,
      );
      const pts = parseShowinfoTimes(snap.stderr)[0];
      if (
        await stat(join(dir, filename))
          .then((f) => f.size > 0)
          .catch(() => false)
      ) {
        actual = Number.isFinite(pts) ? Math.round(pts * 1000) : undefined;
        if (actual !== undefined && actual >= startMs && actual < endMs) break;
        actual = undefined;
      }
    }
    if (actual === undefined)
      throw Error("当前章节无法提取带有效时间戳的画面。");
    if (!frames.some((f) => Math.abs(f.atMs - actual!) < 10))
      frames.push({ filename, atMs: actual });
  }
  // Scene changes supplement the guaranteed temporal coverage, with a bounded frame budget.
  const output = await runCommand(
    bin,
    [
      "-hide_banner",
      "-loglevel",
      "info",
      "-y",
      "-copyts",
      "-start_at_zero",
      "-ss",
      String(startMs / 1000),
      "-t",
      String(span / 1000),
      "-i",
      input,
      "-vf",
      `select='gt(scene,${config.frameSceneThreshold})',scale=${config.frameWidth}:-2,showinfo`,
      "-vsync",
      "vfr",
      "-frames:v",
      "2",
      join(dir, `${prefix}-s-%d.jpg`),
    ],
    signal,
  );
  const sceneTimes = parseShowinfoTimes(output.stderr);
  for (const name of (await readdir(dir))
    .filter((n) => n.startsWith(prefix + "-s-") && n.endsWith(".jpg"))
    .sort()) {
    const n = Number(name.match(/-s-(\d+)\.jpg$/)?.[1]) - 1,
      atMs = Math.round((sceneTimes[n] || 0) * 1000);
    if (
      atMs >= startMs &&
      atMs < endMs &&
      !frames.some((f) => Math.abs(f.atMs - atMs) < 250)
    )
      frames.push({ filename: name, atMs });
  }
  return frames.sort((a, b) => a.atMs - b.atMs);
}
/** One indexed contact sheet avoids ambiguous image ordering in multi-image providers. */
export async function createContactSheet(
  dir: string,
  frames: Frame[],
  signal?: AbortSignal,
): Promise<string> {
  if (frames.length === 1) return join(dir, frames[0].filename);
  const cols = Math.ceil(Math.sqrt(frames.length)),
    width = 512,
    height = 288;
  const filters = frames
    .map(
      (_, i) =>
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[v${i}]`,
    )
    .join(";");
  const layout = frames
    .map((_, i) => `${(i % cols) * width}_${Math.floor(i / cols) * height}`)
    .join("|");
  const output = join(dir, frames[0].filename.replace(".jpg", "-sheet.jpg"));
  await runCommand(
    process.env.FFMPEG_PATH || (ffmpeg as unknown as string),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...frames.flatMap((f) => ["-i", join(dir, f.filename)]),
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      `${filters};${frames.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${frames.length}:layout=${layout}:fill=black[v]`,
      "-map",
      "[v]",
      "-frames:v",
      "1",
      output,
    ],
    signal,
  );
  return output;
}
