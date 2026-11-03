import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { closeDatabase, saveAccountSession, readAccountSession } from "../persistence/database.js";
import { currentAccount, initializeWorkspaceIdentity, localWorkspaceEnabled } from "./github-auth.js";
import { isAdminSession } from "./admin-auth.js";
let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "koma-local-workspace-"));
  vi.stubEnv("DB_DRIVER", "sqlite");
  vi.stubEnv("KOMA_DATABASE_PATH", join(root, "koma.sqlite"));
});
afterAll(async () => { await closeDatabase(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it("requires an explicit opt-in and never treats a local user as an administrator", async () => {
  vi.stubEnv("KOMA_AUTH_MODE", "github");
  expect(localWorkspaceEnabled()).toBe(false);
  expect(await currentAccount(undefined)).toBeNull();
  vi.stubEnv("KOMA_AUTH_MODE", "local");
  await initializeWorkspaceIdentity();
  expect((await currentAccount(undefined))?.id).toBe("local-owner");
  expect(isAdminSession(undefined)).toBe(false);
});
it("persists a real account for job foreign keys, retaining its identity after reopening SQLite", async () => {
  vi.stubEnv("KOMA_AUTH_MODE", "local");
  await initializeWorkspaceIdentity();
  await closeDatabase();
  await initializeWorkspaceIdentity();
  await saveAccountSession("local-workspace-test", "local-owner", Date.now() + 60000);
  expect((await readAccountSession("local-workspace-test"))?.id).toBe("local-owner");
  expect(await currentAccount("koma_session=invalid")).toEqual(await currentAccount(undefined));
});
