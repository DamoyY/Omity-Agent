export type DisplayRole = "user" | "assistant" | "tool";

export interface DisplayImage {
  src: string;
  mimeType: string;
}

export interface DisplayToolCall {
  id: string;
  index: number;
  name: string;
  input: unknown;
  messageId?: string;
  inputText?: string;
  streaming?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface DisplayMessage {
  id: number;
  sourceId?: string;
  role: DisplayRole;
  content: string;
  reasoning: string;
  images: DisplayImage[];
  queueId: number | null;
  toolCalls: DisplayToolCall[];
  toolCallId?: string;
  usage?: TokenUsage;
  createdAt: number;
}

export interface DisplayQueue {
  id: number;
  content: string;
  status: string;
  error: ErrorDetails | null;
  userMessageId?: number | null;
  root?: boolean;
}

export interface DisplayEvent {
  id: number;
  message: string;
  payload: unknown;
}

export interface TimelineMessage {
  id: number;
  key: string;
  role: DisplayRole;
  content: string;
  createdAt: number;
  usage?: TokenUsage;
  parts: TimelinePart[];
}

export type TimelinePart =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | {
      type: "tool";
      call: DisplayToolCall;
      output?: DisplayMessage;
      started?: boolean;
    };
import type { ErrorDetails } from "../../failures/details";
