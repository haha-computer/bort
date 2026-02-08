import { getResponse } from '../ai/openai-client.js';
import { logger } from '../util/logger.js';

const MAX_LENGTH = 2000;

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
 * Strip all mention markup (e.g. <@123456>) from message content.
 */
function stripMentions(content) {
  return content.replace(/<@!?\d+>/g, '').trim();
}

/**
 * Register the messageCreate handler on a Discord client.
 */
export function registerMessageHandler(client) {
  client.on('messageCreate', async (message) => {
    // Ignore bots and messages that don't mention us
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    const userText = stripMentions(message.content);
    if (!userText) return;

    logger.info(`[${message.guild?.name ?? 'DM'}#${message.channel.name ?? 'unknown'}] ${message.author.tag}: ${userText}`);

    try {
      await message.channel.sendTyping();

      const reply = await getResponse(message.channelId, userText);

      const chunks = splitMessage(reply);
      for (const chunk of chunks) {
        await message.reply({ content: chunk, allowedMentions: { repliedUser: false } });
      }
    } catch (err) {
      logger.error('Failed to respond:', err);
      await message.reply({ content: 'Something went wrong. Try again later.', allowedMentions: { repliedUser: false } }).catch(() => {});
    }
  });
}
