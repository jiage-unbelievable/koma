import http from "node:http";
import { sentenceSegments, parseAudioRequest } from "./minimax-asr.mjs";
import { execFileSync } from "node:child_process";
const MODEL = "MiniMax-M3.1-Flash";
const ALLOWED = new Set(
  (process.env.KOMA_BROKER_ALLOWED_REMOTES || "127.0.0.1,::1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const keychainService =
  process.env.KOMA_MINIMAX_KEYCHAIN_SERVICE || "koma.minimax";
const keychainAccount = process.env.KOMA_MINIMAX_KEYCHAIN_ACCOUNT || "api-key";
function reply(res, status, body) {
  res
    .writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    })
    .end(JSON.stringify(body));
}
let active = 0;
const server = http.createServer(async (req, res) => {
  const remote = req.socket.remoteAddress?.replace(/^::ffff:/, "");
  if (!ALLOWED.has(remote) || req.headers.origin)
    return reply(res, 403, { error: { message: "Caller denied" } });
  if (req.method === "GET" && req.url === "/health")
    return reply(res, 200, { ok: true, model: MODEL });
  if (
    req.method !== "POST" ||
    !["/v1/chat/completions", "/v1/audio/transcriptions"].includes(req.url)
  )
    return reply(res, 404, { error: { message: "Route denied" } });
  if (active >= 2)
    return reply(res, 429, { error: { message: "Broker busy" } });
  active++;
  const started = Date.now();
  let images = 0;
  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 40 * 1024 * 1024) {
        reply(res, 413, { error: { message: "Request too large" } });
        return;
      }
      chunks.push(c);
    }
    if (req.url === "/v1/audio/transcriptions") {
      let form;
      try {
        form = await parseAudioRequest(
          Buffer.concat(chunks),
          req.headers["content-type"],
        );
      } catch {
        return reply(res, 400, { error: { message: "Invalid audio request" } });
      }
      let key;
      try {
        key = execFileSync(
          "/usr/bin/security",
          [
            "find-generic-password",
            "-s",
            keychainService,
            "-a",
            keychainAccount,
            "-w",
          ],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 10000,
          },
        ).trim();
        if (!key) throw Error();
      } catch {
        return reply(res, 503, {
          error: { message: "Keychain credential unavailable" },
        });
      }
      const upstream = await fetch(
        "https://api.minimaxi.com/v1/speech_to_text",
        {
          method: "POST",
          headers: { authorization: `Bearer ${key}` },
          body: form,
          redirect: "error",
          signal: AbortSignal.timeout(180000),
        },
      );
      const j = await upstream.json();
      if (!upstream.ok || j.base_resp?.status_code || j.error)
        return reply(res, upstream.ok ? 502 : upstream.status, {
          error: { message: "MiniMax transcription failed" },
        });
      const segments = sentenceSegments(j);
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          operation: "asr",
          model: "asr-1.0",
          seconds: j.duration,
          ok: true,
          elapsedMs: Date.now() - started,
        }),
      );
      return reply(res, 200, {
        text: j.text || "",
        duration: j.duration,
        segments,
        model: "asr-1.0",
      });
    }
    let b;
    try {
      b = JSON.parse(Buffer.concat(chunks));
    } catch {
      return reply(res, 400, { error: { message: "Invalid JSON" } });
    }
    if (
      b.model !== MODEL ||
      !Array.isArray(b.messages) ||
      b.messages.length > 4 ||
      b.stream ||
      b.tools
    )
      return reply(res, 400, { error: { message: "Unsupported request" } });
    for (const m of b.messages) {
      if (
        m.role !== "user" ||
        !(typeof m.content === "string" || Array.isArray(m.content))
      )
        return reply(res, 400, { error: { message: "Unsupported message" } });
      if (Array.isArray(m.content))
        for (const p of m.content) {
          if (p.type === "image_url") {
            if (
              !/^data:image\/(jpeg|png|webp);base64,/.test(
                p.image_url?.url || "",
              )
            )
              return reply(res, 400, {
                error: { message: "Only inline images allowed" },
              });
            images++;
          } else if (p.type !== "text")
            return reply(res, 400, {
              error: { message: "Unsupported content" },
            });
        }
    }
    if (images > 18)
      return reply(res, 400, { error: { message: "Too many images" } });
    let key;
    try {
      key = execFileSync(
        "/usr/bin/security",
        [
          "find-generic-password",
          "-s",
          keychainService,
          "-a",
          keychainAccount,
          "-w",
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 10000,
        },
      ).trim();
      if (!key) throw Error();
    } catch {
      return reply(res, 503, {
        error: { message: "Keychain credential unavailable" },
      });
    }
    const upstream = await fetch(
      "https://api.minimaxi.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: b.messages,
          temperature: Number.isFinite(b.temperature)
            ? Math.min(1, Math.max(0, b.temperature))
            : 0.2,
          max_tokens: Math.min(
            8192,
            Math.max(4096, Number(b.max_tokens) || 4096),
          ),
          thinking: { type: "adaptive" },
          reasoning_effort: "low",
        }),
        redirect: "error",
        signal: AbortSignal.timeout(180000),
      },
    );
    const j = await upstream.json();
    const ok =
      upstream.ok &&
      !j.base_resp?.status_code &&
      typeof j.choices?.[0]?.message?.content === "string" &&
      j.choices[0].message.content.trim();
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        model: MODEL,
        images,
        http: upstream.status,
        ok: Boolean(ok),
        elapsedMs: Date.now() - started,
      }),
    );
    if (!ok)
      return reply(res, upstream.ok ? 502 : upstream.status, {
        error: {
          message: "MiniMax request failed",
          code: j.base_resp?.status_code || j.error?.type || "upstream_error",
        },
      });
    reply(res, 200, {
      model: j.model || MODEL,
      choices: [
        {
          message: { role: "assistant", content: j.choices[0].message.content },
          finish_reason: j.choices[0].finish_reason,
        },
      ],
      usage: j.usage,
    });
  } catch {
    reply(res, 502, { error: { message: "MiniMax upstream unavailable" } });
  } finally {
    active--;
  }
});
server.requestTimeout = 200000;
const port = Number(process.env.KOMA_BROKER_PORT || 10891);
const host = process.env.KOMA_BROKER_HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log(
    `Koma MiniMax broker listening on ${host}:${port}; model=${MODEL}`,
  ),
);
