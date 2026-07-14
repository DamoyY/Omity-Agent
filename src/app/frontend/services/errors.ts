const reportedObjects = new WeakSet<object>();
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (isObject(error)) {
    if (reportedObjects.has(error)) return;
    reportedObjects.add(error);
  }
  if (context) console.error(error, context);
  else console.error(error);
}
export function reportPromiseErrors(promise: Promise<unknown>) {
  void promise.catch((error: unknown) => {
    reportError(error);
  });
}
function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
