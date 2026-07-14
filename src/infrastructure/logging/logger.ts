import type { LogLevel } from "../../types";

const priority: Record<LogLevel, number> = {
  debug: 10,
  error: 40,
  info: 20,
  warn: 30,
};
const styles = {
  blue: "\x1b[34m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
};
const levelMeta: Record<LogLevel, { label: string; mark: string; color: string }> = {
  debug: { color: styles.blue, label: "DEBUG", mark: "·" },
  error: { color: styles.red, label: "ERROR", mark: "✖" },
  info: { color: styles.green, label: "INFO ", mark: "●" },
  warn: { color: styles.yellow, label: "WARN ", mark: "▲" },
};
export class Logger {
  private indent = 0;
  constructor(
    private readonly level: LogLevel,
    private readonly silent = false,
  ) {}
  child(title: string) {
    this.info(`┌─ ${title}`);
    this.indent += 1;
    return () => {
      this.indent = Math.max(0, this.indent - 1);
      this.info(`└─ ${title}`);
    };
  }
  debug(message: string, data?: unknown) {
    this.write("debug", message, data);
  }
  info(message: string, data?: unknown) {
    this.write("info", message, data);
  }
  warn(message: string, data?: unknown) {
    this.write("warn", message, data);
  }
  error(message: string, data?: unknown) {
    this.write("error", message, data);
  }
  token(text: string) {
    if (this.silent) {
      return;
    }
    process.stdout.write(text);
  }
  private write(level: LogLevel, message: string, data?: unknown) {
    if (this.silent) {
      return;
    }
    if (priority[level] < priority[this.level]) {
      return;
    }
    const meta = levelMeta[level];
    const prefix = this.prefix(meta);
    console.log(`${prefix}${"  ".repeat(this.indent)}${message}`);
    for (const line of formatData(data)) {
      console.log(`${this.continuationPrefix()}${"  ".repeat(this.indent)}${line}`);
    }
  }
  private prefix(meta: { label: string; mark: string; color: string }) {
    const time = styles.dim + formatTime(new Date()) + styles.reset;
    const level = meta.color + meta.label + styles.reset;
    const mark = meta.color + meta.mark + styles.reset;
    return `${time} ${level} ${mark} `;
  }
  private continuationPrefix() {
    return `${" ".repeat(13)} ${styles.dim}│${styles.reset} `;
  }
}
export function formatData(data: unknown): string[] {
  if (data === undefined) {
    return [];
  }
  if (isPlainRecord(data)) {
    return Object.entries(data).flatMap(([key, value]) => {
      if (isScalar(value)) {
        return [`${styles.dim}${key}${styles.reset}: ${formatScalar(value)}`];
      }
      const lines = [`${styles.dim}${key}${styles.reset}:`];
      for (const line of JSON.stringify(value, null, 2).split("\n")) {
        lines.push(`  ${line}`);
      }
      return lines;
    });
  }
  return JSON.stringify(data, null, 2).split("\n");
}
function formatTime(date: Date) {
  const time = date.toISOString().slice(11, 23);
  return `${time}Z`;
}
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function isScalar(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}
function formatScalar(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
