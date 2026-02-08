import { getResponse } from '../ai/openai-client.js';
import { toolDefinitions, createToolExecutors } from '../tools/index.js';
import { logger } from '../util/logger.js';

const MAX_LENGTH = 2000;
const recentlyProcessed = new Set();

/**
 * Split text into chunks that fit within Discord's message limit,
 * breaking at natural boundaries (newlines, then spaces).
 */
function splitMessage(text) {
  if (text.length <= MAX_LENGTH) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > MAX_LENGTH) {
    let splitAt = remaining.lastIndexOf('\n', MAX_LENGTH);
    if (splitAt === -1 || splitAt < MAX_LENGTH / 2) {
      splitAt = remaining.lastIndexOf(' ', MAX_LENGTH);
    }
    if (splitAt === -1 || splitAt < MAX_LENGTH / 2) {
      splitAt = MAX_LENGTH;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Resolve mention markup to readable @names. Returns the cleaned text
 * and a map of display names → user IDs for re-mentioning in replies.
 */
function resolveMentions(content, message) {
  const nameToId = new Map();

  const text = content.replace(/<@!?(\d+)>/g, (match, id) => {
    if (id === message.client.user.id) return `@${message.client.user.username}`;
    const member = message.mentions.members?.get(id);
    if (member) {
      nameToId.set(member.displayName, id);
      return `@${member.displayName}`;
    }
    const user = message.mentions.users.get(id);
    if (user) {
      nameToId.set(user.username, id);
      return `@${user.username}`;
    }
    return match;
  }).trim();

  return { text, nameToId };
}

/**
 * Convert @names in AI output back to Discord mention markup,
 * but only for users who were mentioned in the original message
 * or discovered via tool calls.
 */
function insertMentions(content, nameToId) {
  if (nameToId.size === 0) return content;
  let result = content;
  for (const [name, id] of nameToId) {
    result = result.replaceAll(`@${name}`, `<@${id}>`);
  }
  return result;
}

/**
 * Register the messageCreate handler on a Discord client.
 */
export function registerMessageHandler(client) {
  client.on('messageCreate', async (message) => {
    // Ignore bots and messages that don't mention us
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;
    if (recentlyProcessed.has(message.id)) return;
    recentlyProcessed.add(message.id);
    setTimeout(() => recentlyProcessed.delete(message.id), 5000);

    const { text: userText, nameToId } = resolveMentions(message.content, message);
    if (!userText) return;

    logger.info(`[${message.guild?.name ?? 'DM'}#${message.channel.name ?? 'unknown'}] ${message.author.tag}: ${userText}`);

    try {
      await message.channel.sendTyping();

      // Add the message author to the mention map so the AI can @mention them
      const authorName = message.member?.displayName ?? message.author.username;
      nameToId.set(authorName, message.author.id);

      // Build input — just the user's message, with a reply hint if applicable
      let input = `${authorName}: ${userText}`;
      if (message.reference) {
        input += '\n(This message is a reply to an earlier message.)';
      }

      // Create tool executors bound to this message
      const { executors, getDiscoveredMentions } = createToolExecutors(message);

      const reply = await getResponse(message.channelId, input, {
        tools: toolDefinitions,
        toolExecutors: executors,
      });

      // Merge mentions discovered via tool calls
      const discovered = getDiscoveredMentions();
      for (const [name, id] of discovered) {
        if (!nameToId.has(name)) nameToId.set(name, id);
      }

      const finalReply = insertMentions(reply, nameToId);
      const chunks = splitMessage(finalReply);
      for (const chunk of chunks) {
        await message.reply({ content: chunk, allowedMentions: { users: [...nameToId.values()] } });
      }
    } catch (err) {
      logger.error('Failed to respond:', err);
      await message.reply({ content: 'Something went wrong. Try again later.', allowedMentions: { parse: [] } }).catch(() => {});
    }
  });
}
