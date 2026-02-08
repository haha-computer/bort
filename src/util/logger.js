const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let threshold = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function log(level, ...args) {
  if (LEVELS[level] >= threshold) {
    console[level === 'debug' ? 'log' : level](`[${timestamp()}] [${level.toUpperCase()}]`, ...args);
  }
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
