export type DisplayRole = "user" | "assistant" | "tool";

export type DisplayToolCall = {
  id: string;
  index: number;
  name: string;
  input: unknown;
  messageId?: string;
  inputText?: string;
  streaming?: boolean;
};

export type DisplayMessage = {
  id: number;
  sourceId?: string;
  role: DisplayRole;
  content: string;
  queueId: number | null;
  toolCalls: DisplayToolCall[];
  toolCallId?: string;
  createdAt: number;
};

export type DisplayQueue = {
  id: number;
  content: string;
  status: string;
  error: string | null;
  userMessageId?: number | null;
  root?: boolean;
};

export type DisplayEvent = {
  id: number;
  message: string;
  payload: unknown;
};

export type TimelineMessage = {
  id: number;
  key: string;
  role: DisplayRole;
  content: string;
  createdAt: number;
  parts: TimelinePart[];
};

export type TimelinePart =
  | { type: "content"; content: string }
  | { type: "tool"; call: DisplayToolCall; output?: DisplayMessage };
