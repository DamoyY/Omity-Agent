export function formatTokens(tokens: number) {
  if (tokens <= 1000) {
    return `${tokens.toString()} Tokens`;
  }
  const precision = tokens < 10_000 ? 1 : 0;
  const compact = (tokens / 1000).toFixed(precision).replace(/\.0$/, "");
  return `${compact}K Tokens`;
}
