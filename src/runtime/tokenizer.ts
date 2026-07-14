import { getEncoding } from "js-tiktoken";
const tokenizer = getEncoding("o200k_base");
export function countTokens(text: string) {
  return tokenizer.encode(text).length;
}
