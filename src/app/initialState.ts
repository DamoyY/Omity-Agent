import { AIMessage, HumanMessage } from "@langchain/core/messages";

export interface InitialMessagePair {
  user: string;
  assistant: string;
}

export interface InitialSessionState {
  history: InitialMessagePair[];
  message: string;
}

export function initialHistory(history: InitialMessagePair[]) {
  return history.flatMap(({ user, assistant }) => [
    new HumanMessage(user),
    new AIMessage(assistant),
  ]);
}
