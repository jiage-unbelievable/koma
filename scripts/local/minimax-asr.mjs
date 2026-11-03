// MiniMax word timestamps -> readable, verbatim sentence segments. No guessed alignment.
export function sentenceSegments(body) {
  if (!Array.isArray(body.segments)) {
    if (String(body.text || "").trim())
      throw Error("Missing aligned transcription");
    return [];
  }
  const out = [];
  let line = null;
  for (const word of body.segments) {
    if (
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < 0 ||
      word.end < word.start ||
      word.end > 500.5
    )
      throw Error("Invalid ASR timestamps");
    if (!String(word.text || "").trim()) continue;
    if (
      line &&
      (line.speaker !== word.speaker ||
        word.start - line.end > 1 ||
        word.end - line.start > 12 ||
        line.text.length > 100)
    ) {
      out.push(line);
      line = null;
    }
    if (!line)
      line = {
        start: word.start,
        end: word.end,
        text: "",
        speaker: String(word.speaker || ""),
      };
    line.end = word.end;
    line.text += word.text;
    if (/[。！？.!?][\s”’"']*$/.test(word.text)) {
      out.push(line);
      line = null;
    }
  }
  if (line) out.push(line);
  const normalize = (s) => String(s || "").replace(/\s/g, "");
  if (
    normalize(body.text) !==
    normalize(body.segments.map((s) => s.text || "").join(""))
  )
    throw Error("ASR segments do not cover the complete transcript");
  const result = out.map((s) => ({ ...s, text: s.text.trim() }));
  if (String(body.text || "").trim() && !result.length)
    throw Error("Missing aligned transcription");
  return result;
}
export async function parseAudioRequest(bytes, contentType) {
  if (!contentType?.startsWith("multipart/form-data;"))
    throw Error("Expected multipart audio");
  const f = await new Response(bytes, {
    headers: { "content-type": contentType },
  }).formData();
  const file = f.get("file");
  if (
    f.get("model") !== "asr-1.0" ||
    !file ||
    typeof file === "string" ||
    file.size > 8 * 1024 * 1024 ||
    file.size === 0
  )
    throw Error("Invalid audio request");
  const form = new FormData();
  form.append("file", file, "audio.mp3");
  form.append("model", "asr-1.0");
  form.append("response_format", "verbose_json");
  form.append("timestamp_level", "word");
  form.append("stream", "false");
  return form;
}
