import pino from "pino";

function resolveLogLevel(): pino.LevelWithSilent {
  const configured = process.env.LOG_LEVEL;

  if (
    configured === "fatal" ||
    configured === "error" ||
    configured === "warn" ||
    configured === "info" ||
    configured === "debug" ||
    configured === "trace" ||
    configured === "silent"
  ) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const baseLogger = pino({
  level: resolveLogLevel(),
  name: "backend",
});

export function createLogger(component: string): pino.Logger {
  return baseLogger.child({ component });
}

export { baseLogger as logger };
