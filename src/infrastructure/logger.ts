import type { LogLevel } from "../types";

const priority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private indent = 0;

  constructor(private readonly level: LogLevel) {}

  child(title: string) {
    this.info(`┌ ${title}`);
    this.indent += 1;
    return () => {
      this.indent = Math.max(0, this.indent - 1);
      this.info(`└ ${title}`);
    };
  }

  debug(message: string, data?: unknown) {
    this.write("debug", "·", message, data);
  }

  info(message: string, data?: unknown) {
    this.write("info", "•", message, data);
  }

  warn(message: string, data?: unknown) {
    this.write("warn", "!", message, data);
  }

  error(message: string, data?: unknown) {
    this.write("error", "×", message, data);
  }

  token(text: string) {
    process.stdout.write(text);
  }

  private write(
    level: LogLevel,
    mark: string,
    message: string,
    data?: unknown,
  ) {
    if (priority[level] < priority[this.level]) {
      return;
    }
    const prefix = `${new Date().toISOString()} ${mark} ${"  ".repeat(this.indent)}`;
    const suffix = data === undefined ? "" : ` ${JSON.stringify(data)}`;
    console.log(`${prefix}${message}${suffix}`);
  }
}
