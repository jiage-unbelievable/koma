import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { beforeAll, afterAll, it, expect } from "vitest";
let child: ChildProcess;
let url = "";
beforeAll(async () => {
  const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
  const address = socket.address(); if (!address || typeof address === "string") throw Error("port unavailable");
  const port = address.port; await new Promise<void>(resolve => socket.close(() => resolve()));
  url = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["scripts/local/minimax-keychain-broker.mjs"], { env: { ...process.env, KOMA_BROKER_PORT: String(port), KOMA_BROKER_HOST: "127.0.0.1", KOMA_BROKER_ALLOWED_REMOTES: "127.0.0.1" }, stdio: "ignore" });
  for (let i=0;i<50;i++) { try { if ((await fetch(url+"/health")).ok) return; } catch {} await new Promise(r=>setTimeout(r,50)); }
  throw Error("broker failed to start");
});
afterAll(async () => { if (child && child.exitCode === null) { const exit=once(child,"exit"); child.kill(); await exit; } });
it("exposes model health without a credential or upstream request", async () => {
  expect(await (await fetch(url+"/health")).json()).toEqual({ok:true,model:"MiniMax-M3.1-Flash"});
});
it("rejects browser origins before processing requests", async () => {
  expect((await fetch(url+"/health", {headers:{Origin:"https://elsewhere.example"}})).status).toBe(403);
});
it.each([
  ["/v1/responses", {model:"MiniMax-M3.1-Flash",messages:[]},404],
  ["/v1/chat/completions", {model:"other",messages:[]},400],
  ["/v1/chat/completions", {model:"MiniMax-M3.1-Flash",messages:[],stream:true},400],
  ["/v1/chat/completions", {model:"MiniMax-M3.1-Flash",messages:[],tools:[{}]},400],
  ["/v1/chat/completions", {model:"MiniMax-M3.1-Flash",messages:[{role:"user",content:[{type:"image_url",image_url:{url:"https://elsewhere.example/image.png"}}]}]},400],
])("rejects unsupported request without accessing Keychain", async (path,body,status) => {
  const r=await fetch(url+String(path),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  expect(r.status).toBe(status);
});
