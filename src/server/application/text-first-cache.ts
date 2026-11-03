import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  copyStoredFile,
  putStoredFile,
  putStoredText,
} from "../persistence/storage.js";
import { storageWriteJournalPath } from "../persistence/storage-write-journal.js";
import { getJobAbortSignal, type Job } from "./jobs.js";
const MANIFEST = "checkpoints/text-first-v1.json";
interface State {
  fingerprint: string;
  stages: Record<string, unknown>;
  frames: string[];
}
function missing(e: unknown) {
  const x = e as { code?: string; status?: number; statusCode?: number };
  return (
    x.code === "ENOENT" ||
    x.code === "NoSuchKey" ||
    x.status === 404 ||
    x.statusCode === 404
  );
}
async function readState(prefix: string, dir: string): Promise<State | null> {
  const path = join(dir, "checkpoint-read.json");
  try {
    await copyStoredFile(`${prefix}/${MANIFEST}`, path);
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}
export async function fileFingerprint(
  path: string,
  settings: unknown,
): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  h.update(JSON.stringify(settings));
  return h.digest("hex");
}
/** Checkpoints live inside the private job prefix and are removed by normal job deletion. */
export class TextFirstCache {
  private state: State;
  constructor(
    private prefix: string | undefined,
    private dir: string,
    private framesDir: string,
    fingerprint: string,
    private signal?: AbortSignal,
  ) {
    this.state = { fingerprint, stages: {}, frames: [] };
  }
  async open() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.framesDir, { recursive: true });
    if (!this.prefix) return;
    const old = await readState(this.prefix, this.dir);
    if (old?.fingerprint === this.state.fingerprint) {
      this.state = old;
      for (const name of old.frames) {
        if (!/^seg-\d+-[us]-\d+\.jpg$/.test(name))
          throw Error("Invalid checkpoint frame");
        await copyStoredFile(
          `${this.prefix}/checkpoints/frames/${name}`,
          join(this.framesDir, name),
        );
      }
    }
  }
  async memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.signal?.throwIfAborted();
    if (Object.hasOwn(this.state.stages, key))
      return this.state.stages[key] as T;
    const value = await fn();
    this.state.stages[key] = value;
    await this.save();
    return value;
  }
  async frames(names: string[]) {
    for (const name of names) {
      if (this.state.frames.includes(name)) continue;
      if (this.prefix)
        await putStoredFile(
          `${this.prefix}/checkpoints/frames/${name}`,
          join(this.framesDir, name),
          "image/jpeg",
          {
            signal: this.signal,
            journalPath: storageWriteJournalPath(dirname(dirname(this.dir))),
          },
        );
      this.state.frames.push(name);
    }
  }
  private async save() {
    if (this.prefix)
      await putStoredText(
        `${this.prefix}/${MANIFEST}`,
        JSON.stringify(this.state),
        "application/json",
        {
          signal: this.signal,
          journalPath: storageWriteJournalPath(dirname(dirname(this.dir))),
        },
      );
  }
}
/** Retry copies checkpoints into its own private prefix, so deleting the old job is safe. */
export async function cloneTextFirstCheckpoint(
  previous: Job,
  next: Job,
): Promise<void> {
  const signal = getJobAbortSignal(next.id);
  signal?.throwIfAborted();
  const state = await readState(previous.storagePrefix, next.dir);
  if (!state) return;
  for (const name of state.frames) {
    signal?.throwIfAborted();
    if (!/^seg-\d+-[us]-\d+\.jpg$/.test(name))
      throw Error("Invalid checkpoint frame");
    const temp = join(next.dir, name);
    await copyStoredFile(
      `${previous.storagePrefix}/checkpoints/frames/${name}`,
      temp,
    );
    await putStoredFile(
      `${next.storagePrefix}/checkpoints/frames/${name}`,
      temp,
      "image/jpeg",
      {signal,journalPath:storageWriteJournalPath(next.dir)},
    );
  }
  await putStoredText(
    `${next.storagePrefix}/${MANIFEST}`,
    JSON.stringify(state),
    "application/json",
    {signal,journalPath:storageWriteJournalPath(next.dir)},
  );
}
