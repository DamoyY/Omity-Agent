export async function maintainInvocationLease<T>(
  leaseMs: number,
  renew: () => void,
  operation: () => Promise<T>,
) {
  let renewalError: Error | undefined;
  const timer = setInterval(
    () => {
      try {
        renew();
      } catch (error) {
        renewalError =
          error instanceof Error ? error : new Error(String(error));
      }
    },
    Math.max(1, Math.floor(leaseMs / 3)),
  );
  timer.unref();
  try {
    const result = await operation();
    if (renewalError) throw renewalError;
    renew();
    return result;
  } finally {
    clearInterval(timer);
  }
}
