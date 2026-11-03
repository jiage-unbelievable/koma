import "../../styles/text-first.css";
interface ChapterEvidenceData {
  spokenSummary?: string;
  visualSummary?: string;
  uncertainties?: string[];
  transcriptIndices?: number[];
  frameFilenames?: string[];
}
export function ChapterEvidence({
  chapter,
  transcript,
  frames,
  onSeek,
  language,
}: {
  chapter: ChapterEvidenceData;
  transcript: {
    text: string;
    startMs: number;
    endMs: number;
    speaker?: string;
  }[];
  frames: { filename: string; url: string; atMs: number; caption?: string }[];
  onSeek: (ms: number) => void;
  language: "zh" | "en";
}) {
  if (!chapter.transcriptIndices && !chapter.visualSummary) return null;
  const zh = language === "zh";
  return (
    <details className="chapter-evidence">
      <summary>
        {zh ? "查看讲话原文与画面证据" : "Speech and visual evidence"}
      </summary>
      {chapter.spokenSummary && (
        <p>
          <strong>{zh ? "讲话要点：" : "Speech: "}</strong>
          {chapter.spokenSummary}
        </p>
      )}
      {chapter.visualSummary && (
        <p>
          <strong>{zh ? "画面补充：" : "Visible content: "}</strong>
          {chapter.visualSummary}
        </p>
      )}
      {Boolean(chapter.uncertainties?.length) && (
        <p className="evidence-uncertain">
          <strong>{zh ? "无法确认：" : "Uncertain: "}</strong>
          {chapter.uncertainties!.join("；")}
        </p>
      )}
      <div className="evidence-frames">
        {frames
          .filter((f) => chapter.frameFilenames?.includes(f.filename))
          .map((f) => (
            <button
              type="button"
              key={f.filename}
              onClick={() => onSeek(f.atMs)}
              aria-label={`${zh ? "跳到画面" : "Jump to frame"} ${Math.round(f.atMs / 1000)}s`}
            >
              <img loading="lazy" src={f.url} alt={f.caption || ""} />
              <span>{f.caption}</span>
            </button>
          ))}
      </div>
      <div className="evidence-transcript">
        {chapter.transcriptIndices?.map(
          (i) =>
            transcript[i] && (
              <button
                type="button"
                key={i}
                onClick={() => onSeek(transcript[i].startMs)}
              >
                <time>
                  {Math.floor(transcript[i].startMs / 60000)}:
                  {String(
                    Math.floor(transcript[i].startMs / 1000) % 60,
                  ).padStart(2, "0")}
                </time>
                {transcript[i].speaker && (
                  <small>{transcript[i].speaker}</small>
                )}
                {transcript[i].text}
              </button>
            ),
        )}
      </div>
    </details>
  );
}
