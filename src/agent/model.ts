import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatOpenAICompletions } from "@langchain/openai";
import { codexClientFields } from "../infrastructure/openai/codexAuthentication";
import { CompatibleChatOpenAIResponses } from "../infrastructure/openai/compatibleResponses";
import { prepareModelImageMessages } from "../runtime/modelImages";
import type { ModelApi, ModelSettings, Settings } from "../types";

export function buildModel(
  settings: Settings,
  sessionId: string,
  instructions?: string,
) {
  const api = resolveModelApi(settings.model);
  const fields = {
    model: settings.model.model,
    ...modelClientFields(settings.model),
    maxRetries: settings.model.maxRetries,
    timeout: settings.model.timeoutMs,
    promptCacheKey: sessionId,
    streaming: true,
    ...(settings.model.temperature === undefined
      ? {}
      : { temperature: settings.model.temperature }),
  };
  return api === "responses"
    ? new CompatibleChatOpenAIResponses({
        ...fields,
        reasoning: {
          ...(settings.model.reasoning_effort === undefined
            ? {}
            : { effort: settings.model.reasoning_effort }),
          summary: "detailed",
        },
        modelKwargs: {
          include: ["reasoning.encrypted_content"],
          ...(instructions ? { instructions } : {}),
        },
      })
    : new ChatOpenAICompletions({
        ...fields,
        ...(settings.model.reasoning_effort === undefined
          ? {}
          : { reasoning: { effort: settings.model.reasoning_effort } }),
      });
}

export function bindModelTools(
  model: BaseChatModel,
  tools: StructuredToolInterface[],
) {
  if (tools.length === 0) return model;
  if (!model.bindTools) throw new Error("模型不支持工具绑定");
  return model.bindTools(tools);
}

export function modelMessages(
  settings: Settings,
  skillsMessage: string | null | undefined,
  messages: BaseMessage[],
) {
  const api = resolveModelApi(settings.model);
  const prepared = prepareModelImageMessages(messages, api);
  if (api === "responses") {
    return restoreResponsesCustomToolCalls(prepared);
  }
  return [
    new SystemMessage(settings.agent.systemPrompt),
    ...(skillsMessage ? [new SystemMessage(skillsMessage)] : []),
    ...prepared,
  ];
}

export function restoreResponsesCustomToolCalls(messages: BaseMessage[]) {
  return messages.map((message) => {
    if (!AIMessage.isInstance(message)) return message;
    const output = message.response_metadata["output"];
    const toolOutputs = message.additional_kwargs["tool_outputs"];
    if (!Array.isArray(output) || !Array.isArray(toolOutputs)) return message;

    const customCalls = new Map(
      toolOutputs
        .filter(isCustomToolCallItem)
        .map((item) => [item.call_id, item]),
    );
    const restored = output.map((item: unknown) => {
      if (!isRecord(item) || item["type"] !== "function_call") return item;
      const callId = item["call_id"];
      const customCall = typeof callId === "string" && customCalls.get(callId);
      if (!customCall) return item;
      return customCall;
    });
    if (restored.every((item, index) => item === output[index])) return message;
    return new AIMessage({
      content: message.content,
      id: message.id,
      name: message.name,
      tool_calls: message.tool_calls,
      invalid_tool_calls: message.invalid_tool_calls,
      additional_kwargs: message.additional_kwargs,
      response_metadata: { ...message.response_metadata, output: restored },
      usage_metadata: message.usage_metadata,
    });
  });
}

export function buildResponsesInstructions(
  systemPrompt: string,
  skillsMessage: string | null | undefined,
) {
  return [systemPrompt, skillsMessage].filter(Boolean).join("\n\n");
}

export function resolveModelApi(model: ModelSettings): ModelApi {
  return model.provider === "codex" ? "responses" : model.api;
}

function modelClientFields(model: ModelSettings) {
  if (model.provider === "codex") return codexClientFields();
  const apiKey = process.env[model.apiKeyEnv];
  if (!apiKey) throw new Error(`缺少环境变量 ${model.apiKeyEnv}`);
  return {
    apiKey,
    configuration: model.baseURL ? { baseURL: model.baseURL } : undefined,
  };
}

function isCustomToolCallItem(
  value: unknown,
): value is Record<string, unknown> & { call_id: string } {
  return (
    isRecord(value) &&
    value["type"] === "custom_tool_call" &&
    typeof value["call_id"] === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
