import type { SerializerProtocol } from "@langchain/langgraph-checkpoint";

export async function serialize(
  serde: SerializerProtocol,
  value: unknown,
): Promise<[string, Uint8Array]> {
  return await serde.dumpsTyped(value);
}

export async function deserialize<T>(
  serde: SerializerProtocol,
  type: string,
  value: Uint8Array | string,
): Promise<T> {
  return (await serde.loadsTyped(type, value)) as T;
}
