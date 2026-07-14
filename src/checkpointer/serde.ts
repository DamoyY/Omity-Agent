import type { SerializerProtocol } from "@langchain/langgraph-checkpoint";

export async function serialize(
  serde: SerializerProtocol,
  value: unknown,
): Promise<[string, Uint8Array]> {
  return await serde.dumpsTyped(value);
}
export async function deserialize(
  serde: SerializerProtocol,
  type: string,
  value: Uint8Array | string,
): Promise<unknown> {
  const deserialized: unknown = await serde.loadsTyped(type, value);
  return deserialized;
}
