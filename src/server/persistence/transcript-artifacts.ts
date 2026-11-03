import type {
  TranscriptLine,
  Chapter,
  StoredArtifact,
} from "../application/jobs.js";
function stamp(ms: number) {
  const n = Math.max(0, Math.round(ms));
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
}
export function transcriptArtifacts(
  lines: TranscriptLine[],
  chapters: Chapter[],
): StoredArtifact[] {
  const files = [
    [
      "transcript.txt",
      "text",
      "text/plain; charset=utf-8",
      lines
        .map(
          (l) =>
            `[${stamp(l.startMs)}] ${l.speaker ? `[${l.speaker}] ` : ""}${l.text}`,
        )
        .join("\n"),
    ],
    [
      "transcript.srt",
      "srt",
      "application/x-subrip",
      lines
        .map(
          (l, i) =>
            `${i + 1}\n${stamp(l.startMs)} --> ${stamp(l.endMs)}\n${l.text}\n`,
        )
        .join("\n"),
    ],
    [
      "analysis-timeline.json",
      "json",
      "application/json",
      JSON.stringify({ version: 1, transcript: lines, chapters }, null, 2),
    ],
  ];
  return files.map(([name, format, mimeType, content], i) => ({
    id: `source-${i}`,
    name,
    format: format as StoredArtifact["format"],
    mimeType,
    content,
    sizeBytes: Buffer.byteLength(content, "utf8"),
  }));
}
