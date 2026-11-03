export interface ChapterContent {
  title: string;
  summary: string;
  startMs: number;
  endMs: number;
  spokenSummary?: string;
  visualSummary?: string;
  uncertainties?: string[];
  transcriptIndices?: number[];
  frameFilenames?: string[];
}
export interface ChapterFrame { filename: string; url: string; atMs: number; caption?: string }
export interface ChapterLine { text: string; startMs: number; endMs: number; speaker?: string }
export interface ChapterNote { id: string; chapterIndex: number; atMs: number; quote: string; body: string; createdAt: number }

export function chapterFrames(chapter: ChapterContent, frames: ChapterFrame[]) {
  return frames.filter(frame => frame.atMs >= chapter.startMs && frame.atMs < chapter.endMs && (!chapter.frameFilenames || chapter.frameFilenames.includes(frame.filename)));
}
export function chapterLines(chapter: ChapterContent, transcript: ChapterLine[]) {
  return transcript.filter((line, index) => chapter.transcriptIndices ? chapter.transcriptIndices.includes(index) : line.endMs > chapter.startMs && line.startMs < chapter.endMs);
}
export function chapterOpeningTime(chapter: ChapterContent, currentMs: number) {
  return currentMs >= chapter.startMs && currentMs < chapter.endMs ? currentMs : chapter.startMs;
}
export function newNoteId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// navigator.clipboard is unavailable on ordinary LAN HTTP pages.
export async function copyChapterText(text: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* use the browser's copy fallback */ }
  }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.style.cssText = "position:fixed;left:0;top:0;opacity:0;width:1px;height:1px";
  // A modal makes elements outside itself inert, including a temporary copy field.
  (document.querySelector("dialog[open]") || document.body).append(field);
  let copied = false;
  try { field.select(); copied = document.execCommand("copy"); }
  finally { field.remove(); previous?.focus({ preventScroll: true }); }
  if (!copied) throw Error("copy_failed");
}
