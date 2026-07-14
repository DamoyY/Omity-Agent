import { AIMessage, type BaseMessage, SystemMessage } from "@langchain/core/messages";
import type { ModelApi, ModelSettings, Settings } from "../types";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAICompletions } from "@langchain/openai";
import { CompatibleChatOpenAIResponses } from "../infrastructure/openai/compatibleResponses";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { codexClientFields } from "../infrastructure/openai/codexAuthentication";
import { prepareModelImageMessages } from "../runtime/modelImages";
export function buildModel(settings: Settings, sessionId: string, instructions?: string) {
  const api = resolveModelApi(settings.model);
  const fields = {
    model: settings.model.model,
    ...modelClientFields(settings.model),
    maxRetries: 0,
    timeout: settings.model.timeoutMs,
    promptCacheKey: sessionId,
    streaming: true,
    zdrEnabled: true,
    modelKwargs: { store: false },
    ...(settings.model.temperature === undefined
      ? {}
      : { temperature: settings.model.temperature }),
  };
  return api === "responses"
    ? new CompatibleChatOpenAIResponses({
        ...fields,
        modelKwargs: {
          ...fields.modelKwargs,
          include: ["reasoning.encrypted_content"],
          ...(instructions ? { instructions } : {}),
        },
        reasoning: {
          ...(settings.model.reasoning_effort === undefined
            ? {}
            : { effort: settings.model.reasoning_effort }),
          summary: "detailed",
        },
      })
    : new ChatOpenAICompletions({
        ...fields,
        ...(settings.model.reasoning_effort === undefined
          ? {}
          : { reasoning: { effort: settings.model.reasoning_effort } }),
      });
}
export function bindModelTools(model: BaseChatModel, tools: StructuredToolInterface[]) {
  if (tools.length === 0) {
    return model;
  }
  if (!model.bindTools) {
    throw new Error("模型不支持工具绑定");
  }
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
    if (!AIMessage.isInstance(message)) {
      return message;
    }
    const { output } = message.response_metadata;
    const toolOutputs = message.additional_kwargs["tool_outputs"];
    if (!Array.isArray(output) || !Array.isArray(toolOutputs)) {
      return message;
    }
    const customCalls = new Map(
      toolOutputs.filter(isCustomToolCallItem).map((item) => [item.call_id, item]),
    );
    const restored = output.map((item: unknown) => {
      if (!isRecord(item) || item["type"] !== "function_call") {
        return item;
      }
      const callId = item["call_id"];
      const customCall = typeof callId === "string" && customCalls.get(callId);
      if (!customCall) {
        return item;
      }
      return customCall;
    });
    if (restored.every((item, index) => item === output[index])) {
      return message;
    }
    return new AIMessage({
      additional_kwargs: message.additional_kwargs,
      content: message.content,
      id: message.id,
      invalid_tool_calls: message.invalid_tool_calls,
      name: message.name,
      response_metadata: { ...message.response_metadata, output: restored },
      tool_calls: message.tool_calls,
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
  return model.adapter === "codex" ? "responses" : model.adapter;
}
function modelClientFields(model: ModelSettings) {
  if (model.adapter === "codex") {
    return codexClientFields();
  }
  const apiKey = process.env[model.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`缺少环境变量 ${model.apiKeyEnv}`);
  }
  return {
    apiKey,
    configuration: {
      maxRetries: 0,
      ...(model.baseURL ? { baseURL: model.baseURL } : {}),
    },
  };
}
function isCustomToolCallItem(
  value: unknown,
): value is Record<string, unknown> & { call_id: string } {
  return (
    isRecord(value) && value["type"] === "custom_tool_call" && typeof value["call_id"] === "string"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
