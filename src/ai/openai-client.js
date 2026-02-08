import OpenAI from 'openai';
import { modelConfig, systemPrompt } from '../config.js';
import { getResponseId, setResponseId, clearResponseId } from './conversation.js';
import { logger } from '../util/logger.js';

const client = new OpenAI();
const MAX_TOOL_ITERATIONS = 5;

/**
 * Pick reasoning effort based on input length.
 * Short messages stay fast; longer context gets more thought.
 */
function reasoningEffort(input) {
  const len = typeof input === 'number' ? input : input.length;
  if (len > 1000) return 'medium';
  if (len > 300) return 'low';
  return 'minimal';
}

/**
 * Extract the text content from a Responses API response.
 */
function extractText(response) {
  return response.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content)
    .filter((block) => block.type === 'output_text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Send a message to the Responses API and return the text output.
 * Automatically chains conversation per channel via previous_response_id.
 *
 * Options:
 *   tools         — array of tool definitions (flat Responses API schema)
 *   toolExecutors — map of { tool_name: async (args) => string }
 */
export async function getResponse(channelId, userMessage, { tools, toolExecutors } = {}) {
  const previousResponseId = getResponseId(channelId);
  const effort = reasoningEffort(userMessage);

  const params = {
    ...modelConfig,
    reasoning: { effort },
    instructions: systemPrompt,
    input: userMessage,
  };

  if (tools?.length) {
    params.tools = tools;
  }

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

  // Tool loop — execute tool calls and feed results back
  if (toolExecutors) {
    let iterations = 0;
    while (iterations < MAX_TOOL_ITERATIONS) {
      const toolCalls = response.output.filter((item) => item.type === 'function_call');
      if (toolCalls.length === 0) break;

      iterations++;
      logger.info(`Tool iteration ${iterations}: ${toolCalls.map((c) => c.name).join(', ')}`);

      const results = [];
      for (const call of toolCalls) {
        const executor = toolExecutors[call.name];
        if (!executor) {
          logger.warn(`Unknown tool call: ${call.name}`);
          results.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: `Error: unknown tool "${call.name}"`,
          });
          continue;
        }

        try {
          const args = call.arguments ? JSON.parse(call.arguments) : {};
          const output = await executor(args);
          results.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output,
          });
        } catch (err) {
          logger.error(`Tool ${call.name} failed:`, err);
          results.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: `Error executing ${call.name}: ${err.message}`,
          });
        }
      }

      const combinedLength = results.reduce((sum, r) => sum + r.output.length, 0);
      response = await client.responses.create({
        ...modelConfig,
        reasoning: { effort: reasoningEffort(combinedLength) },
        instructions: systemPrompt,
        input: results,
        previous_response_id: response.id,
        tools,
      });
    }
  }

  setResponseId(channelId, response.id);

  return extractText(response) || '(No response generated)';
}
