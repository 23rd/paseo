import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestAgentClient } from "../test-utils/fake-agent-client.js";
import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";
import { BuiltinPluginLoader } from "./builtin/index.js";

const fixtureRoot = fileURLToPath(new URL("./test-fixtures/", import.meta.url));
const fixtureBuiltins = () => new BuiltinPluginLoader(fixtureRoot, ["session-usage-reference"]);

test("resolves a provider plugin session reference through its usage source", async () => {
  const directory = fileURLToPath(
    new URL("./test-fixtures/session-usage-reference/", import.meta.url),
  );
  const daemon = await createTestPaseoDaemon({
    pluginsEnabled: false,
    builtinPlugins: fixtureBuiltins(),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    const agent = await client.createAgent({
      provider: "fixture-session-provider",
      cwd: directory,
    });
    const result = await client.resolveAgentUsageReport({ agentId: agent.id });
    expect(result.reportId).toBe("fixture-session-usage:from-session");
    expect(
      (await client.listUsageReports({ reportIds: [result.reportId!] })).reports[0],
    ).toMatchObject({
      id: result.reportId,
      sourceId: "fixture-session-usage",
      report: { windows: [{ usedPct: 31 }] },
    });
    const reports = await client.listUsageReports();
    expect(reports.reports.map((entry) => entry.id)).toContain(
      "fixture-session-usage:from-session",
    );
    const missing = await client.createAgent({
      provider: "fixture-session-provider",
      cwd: directory,
      model: "missing",
    });
    expect((await client.resolveAgentUsageReport({ agentId: missing.id })).reportId).toBeNull();
  } finally {
    await client.close();
    await daemon.close();
  }
}, 60_000);

test("agent.resolve_usage_report resolves source IDs from provider clients", async () => {
  const directory = fileURLToPath(
    new URL("./test-fixtures/session-usage-reference/", import.meta.url),
  );
  const providers = ["claude", "codex", "copilot", "cursor", "kimi", "generic-acp"] as const;
  const agentClients = Object.fromEntries(
    providers.map((provider) => {
      const client = createTestAgentClient(provider);
      let input: Record<string, string> = {};
      if (provider === "claude") input = { configDir: directory };
      if (provider === "codex") input = { codexHome: directory };
      client.resolveUsageReference = async () => ({
        source: provider,
        input,
      });
      return [provider, client];
    }),
  );
  const daemon = await createTestPaseoDaemon({
    pluginsEnabled: false,
    builtinPlugins: fixtureBuiltins(),
    agentClients,
    providerOverrides: {
      cursor: { extends: "acp", label: "Cursor", command: ["cursor-agent", "acp"] },
      kimi: { extends: "acp", label: "Kimi", command: ["kimi", "acp"] },
      "generic-acp": { extends: "acp", label: "Generic ACP", command: ["generic-acp", "acp"] },
    },
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    for (const provider of providers) {
      const agent = await client.createAgent({ provider, cwd: directory });
      const result = await client.resolveAgentUsageReport({ agentId: agent.id });
      expect(result.reportId, provider).toBe(`${provider}:default`);
    }
  } finally {
    await client.close();
    await daemon.close();
  }
}, 60_000);

test("stored Claude and Codex agents resolve without opening a provider session", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-usage-closed-"));
  const staticDir = await mkdtemp(path.join(os.tmpdir(), "paseo-usage-static-"));
  const sessionsOpened = new Map<string, number>();
  const agentClients = Object.fromEntries(
    ["claude", "codex"].map((provider) => {
      const providerClient = createTestAgentClient(provider, {
        beforeCreateSession: async () => {
          sessionsOpened.set(provider, (sessionsOpened.get(provider) ?? 0) + 1);
        },
      });
      providerClient.resolveUsageReference = async ({ session }) => {
        expect(session).toBeNull();
        return { source: "fixture-session-usage", input: { account: "from-session" } };
      };
      return [provider, providerClient];
    }),
  );
  const options = {
    paseoHomeRoot: root,
    staticDir,
    cleanup: false,
    pluginsEnabled: false,
    builtinPlugins: fixtureBuiltins(),
    agentClients,
  };
  let daemon = await createTestPaseoDaemon(options);
  let client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    const ids: string[] = [];
    for (const provider of ["claude", "codex"]) {
      const agent = await client.createAgent({ provider, cwd: root });
      ids.push(agent.id);
      await client.sendMessage(agent.id, "Say OK.");
      await client.waitForAgentUpsert(agent.id, (snapshot) => snapshot.status === "idle");
      expect(sessionsOpened.get(provider)).toBe(1);
    }
    await client.close();
    await daemon.close();

    daemon = await createTestPaseoDaemon(options);
    client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
    await client.connect();
    await client.fetchAgents({ subscribe: {} });
    for (const [index, provider] of ["claude", "codex"].entries()) {
      const result = await client.resolveAgentUsageReport({ agentId: ids[index]! });
      expect(result.reportId).toBe("fixture-session-usage:from-session");
      expect(
        (await client.listUsageReports({ reportIds: [result.reportId!] })).reports,
      ).toHaveLength(1);
      expect(sessionsOpened.get(provider)).toBe(1);
    }
  } finally {
    await client.close().catch(() => undefined);
    await daemon.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    await rm(staticDir, { recursive: true, force: true });
  }
}, 60_000);
