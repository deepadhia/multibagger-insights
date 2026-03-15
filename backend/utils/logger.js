/**
 * Simple logger for the backend. Prefixes messages with [timestamp] [category].
 * Use logger.info(), logger.warn(), logger.error() with (category, message, ...args).
 */

function timestamp() {
  return new Date().toISOString();
}

function format(category, level, message, args = []) {
  const prefix = `[${timestamp()}] [${category}] [${level}]`;
  if (args.length === 0) return `${prefix} ${message}`;
  return `${prefix} ${message} ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`;
}

function log(level, category, message, ...args) {
  const line = format(category, level, message, args);
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (category, message, ...args) => log("INFO", category, message, ...args),
  warn: (category, message, ...args) => log("WARN", category, message, ...args),
  error: (category, message, ...args) => log("ERROR", category, message, ...args),
};
