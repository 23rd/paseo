import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../../../test-utils/test-logger.js";
import { V2Runtime } from "./runtime.js";

// Answers every request at once except session.wait, which it holds for WAIT_MS before answering,
// the way OpenCode holds the wait response until the session's agent loop is idle.
const FAKE_HELPER = `
import http from "node:http";
const server = http.createServer((request, response) => {
  if (request.url.endsWith("/wait")) {
    setTimeout(() => { response.statusCode = 204; response.end(); }, Number(process.env.WAIT_MS));
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end("{}");
});
server.listen(0, "127.0.0.1", () => {
  console.log("server listening on http://127.0.0.1:" + server.address().port);
});
`;

let root: string;
const defaultDispatcher = getGlobalDispatcher();

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "paseo-opencode-v2-runtime-"));
  vi.stubEnv("PASEO_HOME", path.join(root, "home"));
});

afterEach(async () => {
  setGlobalDispatcher(defaultDispatcher);
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

test("session.wait outlasts the fetch header deadline until the helper reports the session idle", async () => {
  // Stands in for undici's five-minute default, which ended every longer turn.
  setGlobalDispatcher(new Agent({ headersTimeout: 200 }));
  const helper = path.join(root, "fake-opencode.mjs");
  await writeFile(helper, FAKE_HELPER);
  const runtime = new V2Runtime({
    logger: createTestLogger(),
    settings: {
      command: { mode: "replace", argv: [process.execPath, helper] },
      env: { WAIT_MS: "2500" },
    },
    decorateEnv: async (env) => env,
  });
  try {
    const connection = await runtime.acquire();
    await expect(connection.client.session.wait({ sessionID: "ses_long" })).resolves.toBe(
      undefined,
    );
  } finally {
    await runtime.shutdown();
  }
});
