import { useId, useState, type ComponentProps } from "react";
import { ChapterEvidence } from "./ChapterEvidence.js";
import { formatTime } from "../../shared/format.js";

type EvidenceProps = ComponentProps<typeof ChapterEvidence>;
type Chapter = EvidenceProps["chapter"] & {
  title: string;
  summary: string;
  startMs: number;
  endMs: number;
};

export function ChapterNavigation({ chapters, currentMs, transcript, frames, onSeek, language }: {
  chapters: Chapter[];
  currentMs: number;
} & Omit<EvidenceProps, "chapter">) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const prefix = useId();
  const zh = language === "zh";
  return <nav className="chapter-navigation" aria-label={zh ? "视频章节" : "Video chapters"}>
    {chapters.length ? chapters.map((chapter, index) => {
      const open = expanded.has(index);
      const active = currentMs >= chapter.startMs && currentMs < chapter.endMs;
      const id = `${prefix}-chapter-${index}`;
      return <div className={`chapter-entry${active ? " is-current" : ""}`} key={`${chapter.startMs}-${index}`}>
        <div className="chapter-entry-heading">
          <button className="chapter-seek" type="button" onClick={() => onSeek(chapter.startMs)} aria-current={active ? "true" : undefined}>
            <span className="chapter-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="chapter-entry-title"><strong>{chapter.title}</strong><span><time>{formatTime(chapter.startMs)}</time><span aria-hidden="true"> — </span><time>{formatTime(chapter.endMs)}</time>{active && <em>{zh ? "播放中" : "Playing"}</em>}</span></span>
          </button>
          <button className="chapter-disclosure" type="button" aria-expanded={open} aria-controls={id} aria-label={`${open ? (zh ? "收起介绍" : "Collapse introduction") : (zh ? "展开介绍" : "Expand introduction")}：${chapter.title}`} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><path d={open ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        <div id={id} className="chapter-introduction" hidden={!open}>
          <p>{chapter.summary}</p>
          {open && <ChapterEvidence chapter={chapter} transcript={transcript} frames={frames} onSeek={onSeek} language={language} />}
        </div>
      </div>;
    }) : <div className="transcript-empty">{zh ? "这个视频暂时没有章节。可切换到字幕查看原文。" : "No chapters yet. Switch to Transcript to read the original words."}</div>}
  </nav>;
}
