import { useEffect, useRef, useState } from "react";
import { formatTime } from "../../shared/format.js";
import { chapterFrames, chapterLines, chapterOpeningTime, copyChapterText, newNoteId, type ChapterContent, type ChapterFrame, type ChapterLine, type ChapterNote } from "./chapter-content.js";
import "../../styles/chapter-reader.css";

interface Draft { id: string; body: string; quote: string; atMs: number }
export function ChapterReader({ chapter, chapterIndex, currentMs, videoUrl, frames, transcript, jobId, accountId, canWriteNotes, language, onClose }: {
  chapter: ChapterContent; chapterIndex: number; currentMs: number; videoUrl: string; frames: ChapterFrame[]; transcript: ChapterLine[];
  jobId: string; accountId: string | null; canWriteNotes: boolean; language: "zh" | "en"; onClose: (atMs: number) => void;
}) {
  const zh = language === "zh";
  const start = chapterOpeningTime(chapter, currentMs);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const position = useRef(start);
  const [atMs, setAtMs] = useState(start);
  const [follow, setFollow] = useState(true);
  const [selection, setSelection] = useState({ text: "", atMs: start });
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<ChapterNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const draftKey = `koma:chapter-draft:${accountId || "guest"}:${jobId}:${chapterIndex}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (saved && typeof saved.body === "string" && typeof saved.quote === "string" && typeof saved.id === "string" && Number.isSafeInteger(saved.atMs)) return { ...saved, atMs: Math.max(chapter.startMs, Math.min(chapter.endMs, saved.atMs)) };
    } catch { /* storage unavailable or invalid draft */ }
    return { id: newNoteId(), body: "", quote: "", atMs: start };
  });
  const [draftSaved, setDraftSaved] = useState(false);
  const lines = chapterLines(chapter, transcript);
  const pictures = chapterFrames(chapter, frames);
  const activeLine = lines.find(line => atMs >= line.startMs && atMs < line.endMs);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current!;
    const returnFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => { videoRef.current?.pause(); dialog.close(); document.body.style.overflow = previousOverflow; returnFocus?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (!canWriteNotes) return;
    try {
      if (draft.body || draft.quote) localStorage.setItem(draftKey, JSON.stringify(draft));
      else localStorage.removeItem(draftKey);
      setDraftSaved(true);
    } catch { setDraftSaved(false); }
  }, [draft, draftKey, canWriteNotes]);
  useEffect(() => {
    if (!canWriteNotes) { setLoading(false); return; }
    const controller = new AbortController();
    void loadNotes(controller.signal);
    return () => controller.abort();
  }, [jobId, canWriteNotes]);
  useEffect(() => {
    if (follow && !window.getSelection()?.toString()) activeLineRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeLine, follow]);

  async function loadNotes(signal?: AbortSignal) {
    setLoading(true); setLoadError(false);
    try {
      const response = await fetch(`/api/my/jobs/${jobId}/notes`, { cache: "no-store", signal });
      if (!response.ok) throw Error("load_failed");
      const data = await response.json();
      if (!signal?.aborted) setNotes(data.notes);
    } catch { if (!signal?.aborted) setLoadError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  function updateDraft(change: Partial<Draft>) { setDraft(previous => ({ ...previous, ...change, id: newNoteId() })); }
  function seek(ms: number) {
    const target = Math.max(chapter.startMs, Math.min(chapter.endMs, ms));
    if (videoRef.current) videoRef.current.currentTime = target / 1000;
    position.current = target; setAtMs(target);
  }
  function trackVideo() {
    const video = videoRef.current;
    if (!video) return;
    const ms = Math.round(video.currentTime * 1000);
    if (ms < chapter.startMs || ms > chapter.endMs) seek(ms);
    else { position.current = ms; setAtMs(ms); }
    if (ms >= chapter.endMs) video.pause();
  }
  function readSelection() {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) return;
    const range = selected.getRangeAt(0);
    if (!contentRef.current?.contains(range.startContainer) || !contentRef.current.contains(range.endContainer)) return;
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const time = Number(element?.closest("[data-start-ms]")?.getAttribute("data-start-ms") ?? atMs);
    setSelection({ text: selected.toString(), atMs: Math.max(chapter.startMs, Math.min(chapter.endMs, time)) });
    setNotice("");
  }
  async function copy(text: string) {
    try { await copyChapterText(text); setNotice(zh ? "已复制文字" : "Text copied"); }
    catch { setNotice(zh ? "复制未成功，请选中文字后按 Ctrl/Cmd+C。" : "Copy failed. Select the text and press Ctrl/Cmd+C."); }
  }
  async function saveNote() {
    if (saving || !(draft.body.trim() || draft.quote.trim())) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/my/jobs/${jobId}/notes`, { method: "POST", headers: { "content-type": "application/json", "X-Koma-Client": "1" }, body: JSON.stringify({ ...draft, chapterIndex }) });
      if (!response.ok) throw Error("save_failed");
      const data = await response.json();
      setNotes(previous => previous.some(note => note.id === data.note.id) ? previous : [...previous, data.note]);
      setDraft({ id: newNoteId(), body: "", quote: "", atMs: position.current });
      setNotice(zh ? "笔记已保存到此视频" : "Note saved to this video");
    } catch { setNotice(zh ? "笔记未能保存，内容已保留，请重试。" : "Could not save. Your text is kept; please retry."); }
    finally { setSaving(false); }
  }
  const close = () => onCloseRef.current(position.current);
  return <dialog ref={dialogRef} className="chapter-reader" aria-labelledby="chapter-reader-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="chapter-reader-shell">
      <header className="chapter-reader-header"><div><span>{zh ? `第 ${chapterIndex + 1} 章` : `Chapter ${chapterIndex + 1}`} · {formatTime(chapter.startMs)} — {formatTime(chapter.endMs)}</span><h2 id="chapter-reader-title">{chapter.title}</h2></div><button type="button" autoFocus onClick={close} aria-label={zh ? "关闭章节内容" : "Close chapter"}>✕</button></header>
      <div className="chapter-reader-grid">
        <section className="chapter-reader-media" aria-label={zh ? "本章视频" : "Chapter video"}>
          <video ref={videoRef} src={videoUrl} poster={pictures[0]?.url} controls playsInline preload="metadata" onLoadedMetadata={() => { seek(start); void videoRef.current?.play().catch(() => undefined); }} onSeeking={trackVideo} onTimeUpdate={trackVideo} onPlay={() => { if (position.current >= chapter.endMs) seek(chapter.startMs); }} onError={() => setVideoError(true)} />
          {videoError && <p role="alert">{zh ? "视频加载失败。可先阅读原文，关闭后重新打开以重试。" : "Video unavailable. You can read the transcript; reopen the chapter to retry."}</p>}
          <div className="chapter-reader-time"><span>{zh ? "仅播放本章范围" : "Playback is limited to this chapter"}</span><time>{formatTime(atMs)} / {formatTime(chapter.endMs)}</time></div>
          <div className="chapter-reader-selection"><button type="button" disabled={!selection.text} onMouseDown={event => event.preventDefault()} onClick={() => void copy(selection.text)}>{zh ? "复制选中文字" : "Copy selection"}</button>{canWriteNotes && <button type="button" disabled={!selection.text || selection.text.length > 5000 || saving} onMouseDown={event => event.preventDefault()} onClick={() => { updateDraft({ quote: selection.text, atMs: selection.atMs }); textAreaRef.current?.focus(); }}>{zh ? "引用到笔记" : "Quote in a note"}</button>}<button type="button" onClick={() => void copy([chapter.title, chapter.summary, ...lines.map(line => `[${formatTime(line.startMs)}] ${line.text}`)].join("\n\n"))}>{zh ? "复制本章文字" : "Copy chapter text"}</button></div>
          {selection.text.length > 5000 && <p className="chapter-reader-message">{zh ? "引用最多 5000 字，请缩小选区。" : "Select fewer than 5,000 characters to quote."}</p>}
          <div className="chapter-reader-reading" ref={contentRef} onMouseUp={readSelection} onKeyUp={readSelection}>
            <h3>{zh ? "章节介绍" : "Introduction"}</h3><p>{chapter.summary}</p>
            <div className="chapter-reader-transcript-heading"><h3>{zh ? "本章原文" : "Transcript"}</h3><button type="button" aria-pressed={follow} onClick={() => setFollow(value => !value)}>{zh ? "跟随播放" : "Follow playback"}</button></div>
            {lines.length ? lines.map((line, index) => <div className={`chapter-reader-line${activeLine === line ? " is-current" : ""}`} data-start-ms={line.startMs} ref={activeLine === line ? activeLineRef : undefined} key={`${line.startMs}-${index}`}><button type="button" onClick={() => seek(line.startMs)} aria-label={`${zh ? "跳到" : "Seek to"} ${formatTime(line.startMs)}`}>{formatTime(line.startMs)}</button><div>{line.speaker && <small>{line.speaker}</small>}<p>{line.text}</p></div></div>) : <p>{zh ? "本章没有可用的语音原文，可选中章节介绍进行复制或记笔记。" : "No speech transcript. You can select text in the introduction."}</p>}
          </div>
        </section>
        <section className="chapter-reader-notes" aria-label={zh ? "章节笔记" : "Chapter notes"}>
          <h3>{zh ? "章节笔记" : "Chapter notes"}</h3>
          {canWriteNotes ? <>
            <label htmlFor="chapter-note-body">{zh ? "记下你的想法" : "Your thoughts"}</label>
            <div className="chapter-note-anchor"><time>{formatTime(draft.body || draft.quote ? draft.atMs : atMs)}</time><button type="button" disabled={saving} onClick={() => updateDraft({ atMs })}>{zh ? "使用当前时间点" : "Use current time"}</button></div>
            {draft.quote && <div className="chapter-note-quote"><blockquote>{draft.quote}</blockquote><button type="button" disabled={saving} onClick={() => updateDraft({ quote: "" })}>{zh ? "移除引用" : "Remove quote"}</button></div>}
            <textarea id="chapter-note-body" ref={textAreaRef} value={draft.body} disabled={saving} maxLength={5000} rows={6} placeholder={zh ? "选中文字后引用，或直接写下笔记…" : "Quote selected text or write a note…"} onChange={event => updateDraft({ body: event.target.value, ...(!(draft.body || draft.quote) ? { atMs } : {}) })} />
            <div className="chapter-note-save"><small>{draft.body || draft.quote ? (draftSaved ? (zh ? "草稿已保存在本机" : "Draft saved on this device") : (zh ? "草稿尚未保存，请保存笔记" : "Draft not stored; save your note")) : (zh ? "保存后可随视频再次查看" : "Saved notes stay with this video")}</small><button type="button" disabled={saving || !(draft.body.trim() || draft.quote.trim())} onClick={() => void saveNote()}>{saving ? (zh ? "保存中…" : "Saving…") : (zh ? "保存笔记" : "Save note")}</button></div>
          </> : <p>{zh ? "回到自己的工作区后可保存章节笔记。" : "Open a video in your own workspace to save notes."}</p>}
          <p className="chapter-reader-message" role="status">{notice}</p>
          {loading && <p>{zh ? "正在读取笔记…" : "Loading notes…"}</p>}
          {loadError && <p>{zh ? "笔记读取失败。" : "Could not load notes."}<button type="button" onClick={() => void loadNotes()}>{zh ? "重试" : "Retry"}</button></p>}
          <div className="chapter-saved-notes">{notes.filter(note => note.chapterIndex === chapterIndex).map(note => <article key={note.id}><div><button type="button" onClick={() => seek(note.atMs)}>{formatTime(note.atMs)}</button><button type="button" onClick={() => void copy([note.quote, note.body].filter(Boolean).join("\n\n"))}>{zh ? "复制笔记" : "Copy note"}</button></div>{note.quote && <blockquote>{note.quote}</blockquote>}{note.body && <p>{note.body}</p>}</article>)}</div>
        </section>
      </div>
    </div>
  </dialog>;
}
