import pino from "pino";
import type { LoggerOptions } from "pino";
import { getConfig } from "../config/env.js";

let logger: pino.Logger | null = null;

export function getLoggerOptions(): LoggerOptions {
  const config = getConfig();
  const isDev = config.NODE_ENV === "development";
  // In development, default to debug level unless LOG_LEVEL is explicitly set
  const level = isDev && !process.env.LOG_LEVEL ? "debug" : config.LOG_LEVEL;
  return {
    level,
    ...(isDev
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  };
}

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = pino(getLoggerOptions());
  }
  return logger;
}
