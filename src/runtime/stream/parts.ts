import { type ReasoningStreamState, createReasoningStreamState } from "../content";

type SequentialPartKind = "assistant_reasoning_delta" | "assistant_text_delta";
export interface StreamPartState {
  messageId?: string;
  nextPart: number;
  reasoning: ReasoningStreamState;
  sequential?: { id: string; kind: SequentialPartKind };
  tools: Map<number, string>;
}
export function createStreamPartState(): StreamPartState {
  return {
    nextPart: 0,
    reasoning: createReasoningStreamState(),
    tools: new Map(),
  };
}
export function acceptMessageId(state: StreamPartState, incoming?: string) {
  if (incoming && incoming !== state.messageId) {
    state.messageId = incoming;
    state.nextPart = 0;
    state.reasoning = createReasoningStreamState();
    state.sequential = undefined;
    state.tools.clear();
  }
  return state.messageId;
}
export function sequentialPart(state: StreamPartState, kind: SequentialPartKind) {
  if (state.sequential?.kind === kind) {
    return state.sequential.id;
  }
  const id = allocatePart(state);
  state.sequential = { id, kind };
  return id;
}
export function toolPart(state: StreamPartState, index: number) {
  let id = state.tools.get(index);
  if (!id) {
    id = allocatePart(state);
    state.tools.set(index, id);
  }
  state.sequential = undefined;
  return id;
}
function allocatePart(state: StreamPartState) {
  const id = `part-${state.nextPart.toString()}`;
  state.nextPart += 1;
  return id;
}
