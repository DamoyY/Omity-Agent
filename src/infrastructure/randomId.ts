import { customAlphabet } from "nanoid";

const generateShortId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);
export function createShortId() {
  return generateShortId();
}
export function claimShortId(
  claim: (id: string) => boolean,
  generate: () => string = createShortId,
) {
  for (;;) {
    const id = generate();
    if (claim(id)) {
      return id;
    }
  }
}
export async function claimShortIdAsync(
  claim: (id: string) => Promise<boolean>,
  generate: () => string = createShortId,
) {
  for (;;) {
    const id = generate();
    if (await claim(id)) {
      return id;
    }
  }
}
