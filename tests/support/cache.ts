import { type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { afterEach } from "bun:test";
const servers: ReturnType<typeof Bun.serve>[] = [];
const databases: AgentDatabase[] = [];
export function cacheTestCleanup() {
  afterEach(async () => {
    for (const database of databases.splice(0)) {
      database.close();
    }
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
    description: "look up a value",
    func: () => Promise.resolve("unused"),
    name: "lookup",
    schema: {
      additionalProperties: false,
      properties: { query: { type: "string" as const } },
      required: ["query"],
      type: "object" as const,
    },
  });
}
export function imageToolOutput() {
  return new ToolMessage({
    content: [
      { text: "found", type: "text" },
      {
        image_url: { url: "data:image/png;base64,AAAA" },
        type: "image_url",
      },
    ],
    id: "tool-1",
    name: "lookup",
    tool_call_id: "call-1",
  });
}
export function mockCompletions(requests: Record<string, unknown>[]) {
  return mockOpenAI(requests, () => ({
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        message: { content: "ok", role: "assistant" },
      },
    ],
    created: 0,
    id: "completion",
    model: "test",
    object: "chat.completion",
    usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
  }));
}
export function mockResponses(requests: Record<string, unknown>[]) {
  return mockOpenAI(requests, () => ({
    created_at: 0,
    id: `response-${requests.length.toString()}`,
    model: "test",
    object: "response",
    output: [
      {
        content: [{ annotations: [], text: "ok", type: "output_text" }],
        id: `message-${requests.length.toString()}`,
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ],
    output_text: "ok",
    status: "completed",
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }));
}
export function requiredArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("模型请求缺少数组输入");
  }
  return value;
}
function mockOpenAI(requests: Record<string, unknown>[], response: () => unknown) {
  const server = Bun.serve({
    async fetch(request) {
      const body: unknown = await request.json();
      if (!isRecord(body)) {
        throw new Error("模型请求必须是 JSON 对象");
      }
      requests.push(body);
      return Response.json(response());
    },
    port: 0,
  });
  servers.push(server);
  return server;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
