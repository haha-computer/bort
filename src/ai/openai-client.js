import OpenAI from 'openai';
import { modelConfig, systemPrompt } from '../config.js';
import { getResponseId, setResponseId, clearResponseId } from './conversation.js';
import { logger } from '../util/logger.js';

const client = new OpenAI();

/**
 * Send a message to the Responses API and return the text output.
 * Automatically chains conversation per channel via previous_response_id.
 */
export async function getResponse(channelId, userMessage) {
  const previousResponseId = getResponseId(channelId);

  const params = {
    ...modelConfig,
    instructions: systemPrompt,
    input: userMessage,
  };

  if (previousResponseId) {
    params.previous_response_id = previousResponseId;
  }

  let response;
  try {
    response = await client.responses.create(params);
  } catch (err) {
    // If the chain is stale/invalid, clear it and retry once
    if (previousResponseId && err.status === 400) {
      logger.warn(`Stale chain for channel ${channelId}, retrying without previous_response_id`);
      clearResponseId(channelId);
      delete params.previous_response_id;
      response = await client.responses.create(params);
    } else {
      throw err;
    }
  }

  setResponseId(channelId, response.id);

  const text = response.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content)
    .filter((block) => block.type === 'output_text')
    .map((block) => block.text)
    .join('\n');

  return text || '(No response generated)';
}
