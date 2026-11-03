import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { ChapterEvidence } from "./ChapterEvidence.js";
import { formatTime } from "../../shared/format.js";
import { chapterFrames } from "./chapter-content.js";

type EvidenceProps = ComponentProps<typeof ChapterEvidence>;
type Chapter = EvidenceProps["chapter"] & {
  title: string;
  summary: string;
  startMs: number;
  endMs: number;
};

export function ChapterNavigation({ chapters, currentMs, transcript, frames, onSeek, onPreview, language }: {
  chapters: Chapter[];
  currentMs: number;
  onPreview: (index: number) => void;
} & Omit<EvidenceProps, "chapter">) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const prefix = useId();
  const zh = language === "zh";
  const navRef = useRef<HTMLElement>(null);
  const entries = useRef(new Map<number, HTMLDivElement>());
  const currentIndex = chapters.findIndex(chapter => currentMs >= chapter.startMs && currentMs < chapter.endMs);
  useEffect(() => {
    const nav = navRef.current, entry = entries.current.get(currentIndex);
    if (!nav || !entry || nav.scrollHeight <= nav.clientHeight) return;
    const bounds = nav.getBoundingClientRect(), row = entry.getBoundingClientRect();
    if (row.top < bounds.top) nav.scrollTop += row.top - bounds.top;
    else if (row.bottom > bounds.bottom) nav.scrollTop += row.bottom - bounds.bottom;
  }, [currentIndex]);
  return <nav ref={navRef} className="chapter-navigation" aria-label={zh ? "视频章节" : "Video chapters"}>
    {chapters.length ? chapters.map((chapter, index) => {
      const open = expanded.has(index);
      const active = currentMs >= chapter.startMs && currentMs < chapter.endMs;
      const id = `${prefix}-chapter-${index}`;
      const pictures = chapterFrames(chapter, frames);
      const picture = pictures[Math.floor(pictures.length / 2)];
      return <div ref={element => { if (element) entries.current.set(index, element); else entries.current.delete(index); }} className={`chapter-entry${active ? " is-current" : ""}`} key={`${chapter.startMs}-${index}`}>
        <div className="chapter-entry-heading">
          <button className="chapter-seek" type="button" onClick={() => onSeek(chapter.startMs)} aria-current={active ? "true" : undefined}>
            <span className="chapter-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="chapter-entry-title"><strong>{chapter.title}</strong><span><time>{formatTime(chapter.startMs)}</time><span aria-hidden="true"> — </span><time>{formatTime(chapter.endMs)}</time>{active && <em>{zh ? "当前章节" : "Current chapter"}</em>}</span></span>
          </button>
          <button type="button" className="chapter-thumbnail" aria-haspopup="dialog" aria-label={`${zh ? "查看章节内容" : "Open chapter"}：${chapter.title}`} onClick={() => onPreview(index)}>{picture && <img loading="lazy" src={picture.url} alt="" />}<span>{zh ? "查看" : "View"}<span aria-hidden="true"> ▷</span></span></button>
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
