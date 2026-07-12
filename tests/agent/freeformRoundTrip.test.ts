import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { afterEach, expect, test } from "bun:test";
import { modelMessages } from "../../src/agent/model";
import { createToolInvoker } from "../../src/agent/toolExecution";
import { configureFreeformMcpTools } from "../../src/infrastructure/mcp/freeformInputs";
import { CompatibleChatOpenAIResponses } from "../../src/infrastructure/openai/compatibleResponses";
import {
  messageInsert,
  messageRowsToChatMessages,
} from "../../src/infrastructure/database/records/messages/serialization";
import { testSettings } from "../support/settings";

const servers: ReturnType<typeof Bun.serve>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});

test("custom MCP tool output completes a Responses API round trip", async () => {
  const requests: Record<string, unknown>[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push(body);
      if (requests.length === 1) return Response.json(customToolResponse());
      const input = body["input"];
      const output = Array.isArray(input)
        ? (input as unknown[]).at(-1)
        : undefined;
      const customCall = Array.isArray(input)
        ? (input as unknown[]).find(
            (item) => isRecord(item) && item["type"] === "custom_tool_call",
          )
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
  });
  servers.push(server);

  const tool = new DynamicStructuredTool({
    name: "apply_patch",
    description: "Apply a patch",
    schema: {
      type: "object" as const,
      properties: { patch: { type: "string" as const } },
      required: ["patch"],
      additionalProperties: false,
    },
    func: () => Promise.resolve("Done!"),
  });
  const configured = configureFreeformMcpTools([tool], ["apply_patch"]);
  const model = new CompatibleChatOpenAIResponses({
    model: "test-model",
    apiKey: "test-key",
    maxRetries: 0,
    streaming: false,
    promptCacheKey: "test-session",
    configuration: { baseURL: `${server.url}v1` },
  }).bindTools(configured.modelTools);
  const human = new HumanMessage("Apply the patch");
  const assistant = await model.invoke([human]);
  const responseOutput: unknown = assistant.response_metadata["output"];
  const rawCustomCall = Array.isArray(responseOutput)
    ? (responseOutput as unknown[])[0]
    : undefined;
  assistant.additional_kwargs["tool_outputs"] = [rawCustomCall];
  assistant.response_metadata["output"] = [
    { type: "function_call", call_id: "call_1", name: "apply_patch" },
  ];
  const stored = messageInsert(assistant);
  const hydrated = messageRowsToChatMessages([
    { message_json: stored.messageJson, source_id: stored.sourceId },
  ])[0];
  if (!AIMessage.isInstance(hydrated)) {
    throw new Error("stored assistant response is not an AIMessage");
  }
  const call = hydrated.tool_calls?.[0];
  if (!call) throw new Error("mock upstream did not return a tool call");
  const invokeTool = createToolInvoker([tool], {
    settings: responsesSettings(),
    sessionId: "test-session",
    freeformToolParameters: configured.parameters,
  });
  const output = await invokeTool(
    call,
    { messages: [human, hydrated] } as never,
    { configurable: { thread_id: "test-thread" } } as never,
  );

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
      id: "ct_1",
      type: "custom_tool_call",
      status: "completed",
      call_id: "call_1",
      name: "apply_patch",
      input: "*** Begin Patch\n*** End Patch",
    },
  ]);
}

function textResponse() {
  return response([
    {
      id: "msg_1",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [
        { type: "output_text", text: "Patch applied", annotations: [] },
      ],
    },
  ]);
}

function response(output: unknown[]) {
  return {
    id: "resp_1",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "test-model",
    output,
    output_text: "",
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function responsesSettings() {
  const settings = testSettings("data");
  settings.model.api = "responses";
  return settings;
}
