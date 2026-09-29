import pino from "pino";
import { expect, test } from "vitest";
import type { SessionOutboundMessage } from "../../messages.js";
import { UsageSession } from "./usage-session.js";

test("collects live references for usage reports and resolves an agent report", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const references: unknown[] = [];
  const reference = { source: "fixture", input: { account: "one" } };
  const agent = {
    id: "one",
    session: {},
  };
  const entry = {
    id: "fixture:one",
    account: {},
    fetchedAt: "2026-01-01T00:00:00.000Z",
    sourceId: "fixture",
    sourceLabel: "Fixture",
    report: { status: "available" as const, windows: [] },
  };
  const usage = new UsageSession({
    emit: (message) => emitted.push(message),
    listAgents: () => [agent, { id: "closed", session: null }],
    resolveAgentReference: async (id) => ({ found: id === "one", reference }),
    runtime: {
      async listUsageReports(options) {
        references.push(options.references);
        return [entry];
      },
      async resolveUsageReference(value) {
        references.push(value);
        return entry.id;
      },
      async listLegacyUsage() {
        return { fetchedAt: "2026-01-01T00:00:00.000Z", providers: [] };
      },
    },
    logger: pino({ level: "silent" }),
  });

  await usage.handleListReports({ type: "usage.list_reports.request", requestId: "list" });
  await usage.handleResolveAgentReport({
    type: "agent.resolve_usage_report.request",
    requestId: "one",
    agentId: "one",
  });
  expect(references).toEqual([[reference], reference]);
  expect(emitted.map((message) => message.type)).toEqual([
    "usage.list_reports.response",
    "agent.resolve_usage_report.response",
  ]);
});

test("surfaces a legacy usage-list failure as an rpc_error envelope", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const usage = new UsageSession({
    emit: (message) => emitted.push(message),
    listAgents: () => [],
    resolveAgentReference: async () => ({ found: false, reference: null }),
    runtime: {
      async listUsageReports() {
        return [];
      },
      async resolveUsageReference() {
        return null;
      },
      async listLegacyUsage(): Promise<never> {
        throw new Error("quota service down");
      },
    },
    logger: pino({ level: "silent" }),
  });
  await usage.handleLegacyList({ type: "provider.usage.list.request", requestId: "u1" });
  expect(emitted[0]).toMatchObject({
    type: "rpc_error",
    payload: { requestId: "u1", code: "provider_usage_list_failed" },
  });
});

test("unknown agent returns agent_not_found", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const usage = new UsageSession({
    emit: (message) => emitted.push(message),
    listAgents: () => [],
    resolveAgentReference: async () => ({ found: false, reference: null }),
    runtime: {
      listUsageReports: async () => [],
      resolveUsageReference: async () => null,
      listLegacyUsage: async () => ({ fetchedAt: "", providers: [] }),
    },
    logger: pino({ level: "silent" }),
  });
  await usage.handleResolveAgentReport({
    type: "agent.resolve_usage_report.request",
    requestId: "missing",
    agentId: "missing",
  });
  expect(emitted[0]).toMatchObject({ type: "rpc_error", payload: { code: "agent_not_found" } });
});
