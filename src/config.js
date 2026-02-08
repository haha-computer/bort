import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const rawModelConfig = JSON.parse(
  readFileSync(join(root, 'config', 'model.json'), 'utf-8')
);

const DEFAULT_CHAIN_TTL_MINUTES = 60;
const DEFAULT_MAX_CHANNEL_CHAINS = 1000;

function parsePositiveInt(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

const { bort: rawBotConfig = {}, ...openAiConfig } = rawModelConfig ?? {};

export const botConfig = {
  chainTtlMinutes: parsePositiveInt(
    rawBotConfig.chain_ttl_minutes,
    DEFAULT_CHAIN_TTL_MINUTES
  ),
  maxChannelChains: parsePositiveInt(
    rawBotConfig.max_channel_chains,
    DEFAULT_MAX_CHANNEL_CHAINS
  ),
};

export const modelConfig = openAiConfig;

export const systemPrompt = readFileSync(
  join(root, 'prompts', 'system.txt'), 'utf-8'
).trim();
