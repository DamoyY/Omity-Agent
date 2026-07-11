import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatOpenAICompletions } from "@langchain/openai";
import { CompatibleChatOpenAIResponses } from "../infrastructure/responses";
import { prepareModelImageMessages } from "../runtime/modelImages";
import type { Settings } from "../types";

export function buildModel(settings: Settings, instructions?: string) {
  const apiKey = process.env[settings.model.apiKeyEnv];
  if (!apiKey) throw new Error(`缺少环境变量 ${settings.model.apiKeyEnv}`);
  const fields = {
    model: settings.model.model,
    apiKey,
    maxRetries: settings.model.maxRetries,
    timeout: settings.model.timeoutMs,
    streaming: true,
    configuration: settings.model.baseURL
      ? { baseURL: settings.model.baseURL }
      : undefined,
    ...(settings.model.temperature === undefined
      ? {}
      : { temperature: settings.model.temperature }),
    ...(settings.model.reasoning_effort === undefined
      ? {}
      : { reasoning: { effort: settings.model.reasoning_effort } }),
  };
  return settings.model.api === "responses"
    ? new CompatibleChatOpenAIResponses({
        ...fields,
        ...(instructions ? { modelKwargs: { instructions } } : {}),
      })
    : new ChatOpenAICompletions(fields);
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
  const prepared = prepareModelImageMessages(messages, settings.model.api);
  if (settings.model.api === "responses") return prepared;
  return [
    new SystemMessage(settings.agent.systemPrompt),
    ...(skillsMessage ? [new SystemMessage(skillsMessage)] : []),
    ...prepared,
  ];
}

export function buildResponsesInstructions(
  systemPrompt: string,
  skillsMessage: string | null | undefined,
) {
  return [systemPrompt, skillsMessage].filter(Boolean).join("\n\n");
}
