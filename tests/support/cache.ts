import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { afterEach } from "bun:test";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";

const servers: ReturnType<typeof Bun.serve>[] = [];
const databases: AgentDatabase[] = [];

export function cacheTestCleanup() {
  afterEach(async () => {
    for (const database of databases.splice(0)) database.close();
    await Promise.all(servers.splice(0).map((server) => server.stop(true)));
  });
}

export function persist(messages: BaseMessage[]) {
  const database = new AgentDatabase(":memory:");
  databases.push(database);
  database.createSession("session", process.cwd());
  database.syncHistory("session", messages);
  return database.history("session");
}

export function lookupTool() {
  return new DynamicStructuredTool({
    name: "lookup",
    description: "look up a value",
    schema: {
      type: "object" as const,
      properties: { query: { type: "string" as const } },
      required: ["query"],
      additionalProperties: false,
    },
    func: () => Promise.resolve("unused"),
  });
}

export function imageToolOutput() {
  return new ToolMessage({
    id: "tool-1",
    tool_call_id: "call-1",
    name: "lookup",
    content: [
      { type: "text", text: "found" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAAA" },
      },
    ],
  });
}

export function mockCompletions(requests: Record<string, unknown>[]) {
  return mockOpenAI(requests, () => ({
    id: "completion",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }));
}

export function mockResponses(requests: Record<string, unknown>[]) {
  return mockOpenAI(requests, () => ({
    id: `response-${requests.length.toString()}`,
    object: "response",
    created_at: 0,
    status: "completed",
    model: "test",
    output: [
      {
        id: `message-${requests.length.toString()}`,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "ok", annotations: [] }],
      },
    ],
    output_text: "ok",
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }));
}

export function requiredArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("模型请求缺少数组输入");
  return value;
}

function mockOpenAI(
  requests: Record<string, unknown>[],
  response: () => unknown,
) {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push(body);
      return Response.json(response());
    },
  });
  servers.push(server);
  return server;
}
