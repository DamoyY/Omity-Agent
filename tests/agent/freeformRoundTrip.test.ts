import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import {
  messageInsert,
  messageRowsToChatMessages,
} from "../../src/infrastructure/database/records/messages/serialization";
import { CompatibleChatOpenAIResponses } from "../../src/infrastructure/openai/compatibleResponses";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { configureFreeformMcpTools } from "../../src/infrastructure/mcp/freeformInputs";
import { createToolInvoker } from "../../src/agent/toolExecution";
import { modelMessages } from "../../src/agent/model";
import { testSettings } from "../support/settings";
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});
test("custom MCP tool output completes a Responses API round trip", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = Bun.serve({
    async fetch(request) {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push(body);
      if (requests.length === 1) {
        return Response.json(customToolResponse());
      }
      const { input } = body;
      const output = Array.isArray(input) ? (input as unknown[]).at(-1) : undefined;
      const customCall = Array.isArray(input)
        ? (input as unknown[]).find((item) => isRecord(item) && item["type"] === "custom_tool_call")
        : undefined;
      if (
        !isRecord(customCall) ||
        !isRecord(output) ||
        output["type"] !== "custom_tool_call_output" ||
        output["call_id"] !== customCall["call_id"]
      ) {
        return Response.json(
          { error: { message: "custom tool output type mismatch" } },
          { status: 502 },
        );
      }
      return Response.json(textResponse());
    },
    port: 0,
  });
  servers.push(server);
  const tool = new DynamicStructuredTool({
    description: "Apply a patch",
    func: () => Promise.resolve("Done!"),
    name: "apply_patch",
    schema: {
      additionalProperties: false,
      properties: { patch: { type: "string" as const } },
      required: ["patch"],
      type: "object" as const,
    },
  });
  const configured = configureFreeformMcpTools([tool], ["apply_patch"]);
  const model = new CompatibleChatOpenAIResponses({
    apiKey: "test-key",
    configuration: { baseURL: `${server.url}v1` },
    maxRetries: 0,
    model: "test-model",
    promptCacheKey: "test-session",
    streaming: false,
  }).bindTools(configured.modelTools);
  const human = new HumanMessage("Apply the patch");
  const assistant = await model.invoke([human]);
  const responseOutput: unknown = assistant.response_metadata["output"];
  const rawCustomCall = Array.isArray(responseOutput)
    ? (responseOutput as unknown[])[0]
    : undefined;
  assistant.additional_kwargs["tool_outputs"] = [rawCustomCall];
  assistant.response_metadata["output"] = [
    { call_id: "call_1", name: "apply_patch", type: "function_call" },
  ];
  const stored = messageInsert(assistant);
  const [hydrated] = messageRowsToChatMessages([
    { message_json: stored.messageJson, source_id: stored.sourceId },
  ]);
  if (!AIMessage.isInstance(hydrated)) {
    throw new Error("stored assistant response is not an AIMessage");
  }
  const call = hydrated.tool_calls?.[0];
  if (!call) {
    throw new Error("mock upstream did not return a tool call");
  }
  const invokeTool = createToolInvoker([tool], {
    freeformToolParameters: configured.parameters,
    sessionId: "test-session",
    settings: responsesSettings(),
  });
  const output = await invokeTool(call, {
    configurable: { thread_id: "test-thread" },
  } as never);
  const final = await model.invoke(
    modelMessages(responsesSettings(), null, [human, hydrated, output]),
  );
  expect(final.text).toBe("Patch applied");
  expect(requests).toHaveLength(2);
  expect(requests[1]?.["previous_response_id"]).toBeUndefined();
  expect(requests[1]?.["prompt_cache_key"]).toBe("test-session");
});
function customToolResponse() {
  return response([
    {
      call_id: "call_1",
      id: "ct_1",
      input: "*** Begin Patch\n*** End Patch",
      name: "apply_patch",
      status: "completed",
      type: "custom_tool_call",
    },
  ]);
}
function textResponse() {
  return response([
    {
      content: [{ annotations: [], text: "Patch applied", type: "output_text" }],
      id: "msg_1",
      role: "assistant",
      status: "completed",
      type: "message",
    },
  ]);
}
function response(output: unknown[]) {
  return {
    created_at: 0,
    id: "resp_1",
    model: "test-model",
    object: "response",
    output,
    output_text: "",
    status: "completed",
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function responsesSettings() {
  const settings = testSettings("data");
  settings.model.adapter = "responses";
  return settings;
}
