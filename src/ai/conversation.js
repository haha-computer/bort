import { logger } from '../util/logger.js';

/** @type {Map<string, string>} channelId -> previous_response_id */
const chains = new Map();

export function getResponseId(channelId) {
  return chains.get(channelId) ?? undefined;
}

export function setResponseId(channelId, responseId) {
  chains.set(channelId, responseId);
  logger.debug(`Chain updated for channel ${channelId}: ${responseId}`);
}

export function clearResponseId(channelId) {
  chains.delete(channelId);
  logger.info(`Chain cleared for channel ${channelId}`);
}
