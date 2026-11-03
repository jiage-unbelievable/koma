import type { TranscriptLine } from "../shared/types.js";
export interface TextSection {
  id: string;
  startMs: number;
  endMs: number;
  title: string;
  spokenSummary: string;
  transcriptIndices: number[];
}
export interface Group {
  first: number;
  last: number;
  title: string;
  summary: string;
}
/** Every input sentence is sent exactly once to the planning stage; nothing is truncated. */
export function transcriptBatches(
  lines: TranscriptLine[],
  maxChars = 12000,
): number[][] {
  const batches: number[][] = [];
  let batch: number[] = [],
    size = 0;
  lines.forEach((line, i) => {
    if (line.text.length > maxChars)
      throw Error("单句转写超过分段预算，请检查ASR时间戳粒度。");
    if (
      batch.length &&
      (size + line.text.length > maxChars || batch.length >= 120)
    ) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(i);
    size += line.text.length;
  });
  if (batch.length) batches.push(batch);
  return batches;
}
export function validateGroups(raw: unknown, indices: number[]): Group[] {
  if (!Array.isArray(raw) || !raw.length)
    throw Error("文字分段没有返回有效章节。");
  let expected = indices[0];
  const out = raw.map((v: unknown) => {
    const x = v as Group;
    if (
      !x ||
      !Number.isInteger(x.first) ||
      !Number.isInteger(x.last) ||
      x.first !== expected ||
      x.last < x.first ||
      x.last > indices.at(-1)! ||
      typeof x.title !== "string" ||
      !x.title.trim() ||
      typeof x.summary !== "string"
    )
      throw Error("文字分段未连续覆盖全部转写，请重试当前阶段。");
    expected = x.last + 1;
    return {
      first: x.first,
      last: x.last,
      title: x.title.slice(0, 160),
      summary: x.summary.slice(0, 2000),
    };
  });
  if (expected !== indices.at(-1)! + 1)
    throw Error("文字分段遗漏了末尾转写，请重试当前阶段。");
  return out;
}
/** Assign every sentence to one chapter and cover silent gaps and the full timeline. */
export function timeSections(
  groups: Group[],
  lines: TranscriptLine[],
  durationMs: number,
  maxSpanMs = 180000,
  maxSections = 80,
): TextSection[] {
  const out: TextSection[] = [];
  const base = groups.length
    ? groups
    : [
        {
          first: 0,
          last: -1,
          title: "无讲话画面",
          summary: "没有可用讲话文字，按时间覆盖画面。",
        },
      ];
  for (let i = 0; i < base.length; i++) {
    const group = base[i];
    let start = i === 0 ? 0 : lines[group.first].startMs;
    const end =
      i === base.length - 1 ? durationMs : lines[base[i + 1].first].startMs;
    if (end <= start) throw Error("转写时间戳无法形成有效章节。");
    let part = 0;
    while (start < end) {
      let stop = Math.min(end, start + maxSpanMs);
      if (stop < end) {
        const near = lines
          .filter((l) => l.startMs > start + maxSpanMs / 2 && l.startMs <= stop)
          .at(-1);
        if (near) stop = near.startMs;
      }
      const indices = lines
        .map((l, k) => (l.startMs >= start && l.startMs < stop ? k : -1))
        .filter((k) => k >= 0);
      out.push({
        id: `section-${out.length}`,
        startMs: start,
        endMs: stop,
        title: (indices.length ? group.title : "无讲话画面") + (part ? ` · ${part + 1}` : ""),
        spokenSummary: indices.length
          ? group.summary
          : "此区间没有可用讲话文字。",
        transcriptIndices: indices,
      });
      if (out.length > maxSections)
        throw Error(
          `视频需要超过${maxSections}段，已停止，避免静默遗漏内容。请提高段数预算或拆分视频。`,
        );
      part++;
      start = stop;
    }
  }
  return out;
}
export function validateTranscript(
  lines: TranscriptLine[],
  durationMs: number,
): void {
  let previous = -1;
  for (const l of lines) {
    if (
      !Number.isFinite(l.startMs) ||
      !Number.isFinite(l.endMs) ||
      l.startMs < previous ||
      l.startMs < 0 ||
      l.endMs < l.startMs ||
      l.endMs > durationMs + 1500
    )
      throw Error("ASR返回无效时间戳，无法可靠分段。");
    previous = l.startMs;
  }
}
