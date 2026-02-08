import { botConfig } from '../config.js';
import { logger } from '../util/logger.js';

const MAX_CHAIN_AGE_MS = botConfig.chainTtlMinutes * 60 * 1000;
const MAX_CHANNEL_CHAINS = botConfig.maxChannelChains;

/** @type {Map<string, { id: string, lastUsed: number }>} channelId -> chain metadata */
const chains = new Map();

function pruneChains(now = Date.now()) {
  for (const [channelId, entry] of chains) {
    if (now - entry.lastUsed > MAX_CHAIN_AGE_MS) {
      chains.delete(channelId);
      logger.info(`Chain expired for channel ${channelId}`);
    }
  }

  while (chains.size > MAX_CHANNEL_CHAINS) {
    let oldestId;
    let oldestTime = Infinity;
    for (const [channelId, entry] of chains) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = channelId;
      }
    }
    if (!oldestId) break;
    chains.delete(oldestId);
    logger.info(`Chain evicted for channel ${oldestId}`);
  }
}

export function getResponseId(channelId) {
  pruneChains();
  const entry = chains.get(channelId);
  if (!entry) return undefined;
  entry.lastUsed = Date.now();
  return entry.id;
}

export function setResponseId(channelId, responseId) {
  const now = Date.now();
  chains.set(channelId, { id: responseId, lastUsed: now });
  pruneChains(now);
  logger.debug(`Chain updated for channel ${channelId}: ${responseId}`);
}

export function clearResponseId(channelId) {
  chains.delete(channelId);
  logger.info(`Chain cleared for channel ${channelId}`);
}
