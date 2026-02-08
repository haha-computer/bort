import { getResponse } from '../ai/openai-client.js';
import { toolDefinitions, createToolExecutors } from '../tools/index.js';
import { logger } from '../util/logger.js';

const MAX_LENGTH = 2000;
const recentlyProcessed = new Set();
const channelQueues = new Map();

function enqueueChannelTask(channelId, task) {
  const previous = channelQueues.get(channelId) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task)
    .catch((err) => {
      logger.error('Channel task failed:', err);
    });
  channelQueues.set(
    channelId,
    next.finally(() => {
      if (channelQueues.get(channelId) === next) {
        channelQueues.delete(channelId);
      }
    })
  );
  return next;
}

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
  return replaceMentionsOutsideCode(content, nameToId);
}

function replaceMentionsOutsideCode(content, nameToId) {
  if (!content.includes('`')) {
    let result = content;
    for (const [name, id] of nameToId) {
      result = result.replaceAll(`@${name}`, `<@${id}>`);
    }
    return result;
  }

  let result = '';
  let i = 0;
  let inBlock = false;
  let inInline = false;

  while (i < content.length) {
    if (!inInline && content.startsWith('```', i)) {
      inBlock = !inBlock;
      result += '```';
      i += 3;
      continue;
    }

    if (!inBlock && content[i] === '`') {
      inInline = !inInline;
      result += '`';
      i += 1;
      continue;
    }

    if (inBlock || inInline) {
      result += content[i];
      i += 1;
      continue;
    }

    let next = content.indexOf('`', i);
    if (next === -1) next = content.length;
    let segment = content.slice(i, next);
    for (const [name, id] of nameToId) {
      segment = segment.replaceAll(`@${name}`, `<@${id}>`);
    }
    result += segment;
    i = next;
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
    if (!message.partial && !message.mentions.has(client.user)) return;

    enqueueChannelTask(message.channelId, async () => {
      let workingMessage = message;
      if (workingMessage.partial) {
        try {
          workingMessage = await workingMessage.fetch();
        } catch (err) {
          logger.warn('Failed to fetch partial message:', err);
          return;
        }
      }

      if (!workingMessage.mentions.has(client.user)) return;
      if (recentlyProcessed.has(workingMessage.id)) return;
      recentlyProcessed.add(workingMessage.id);
      setTimeout(() => recentlyProcessed.delete(workingMessage.id), 5000);

      const { text: userText, nameToId } = resolveMentions(workingMessage.content ?? '', workingMessage);
      if (!userText) return;

      logger.info(`[${workingMessage.guild?.name ?? 'DM'}#${workingMessage.channel.name ?? 'unknown'}] ${workingMessage.author.tag}: ${userText}`);

      try {
        await workingMessage.channel.sendTyping();

        // Add the message author to the mention map so the AI can @mention them
        const authorName = workingMessage.member?.displayName ?? workingMessage.author.username;
        nameToId.set(authorName, workingMessage.author.id);

        // Build input — just the user's message, with a reply hint if applicable
        let input = `${authorName}: ${userText}`;
        if (workingMessage.reference) {
          input += '\n(This message is a reply to an earlier message.)';
        }

        // Create tool executors bound to this message
        const { executors, getDiscoveredMentions } = createToolExecutors(workingMessage);

        const reply = await getResponse(workingMessage.channelId, input, {
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
        const allowedMentions = { users: [...nameToId.values()], repliedUser: false };

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (i === 0) {
            await workingMessage.reply({ content: chunk, allowedMentions });
          } else {
            await workingMessage.channel.send({ content: chunk, allowedMentions });
          }
        }
      } catch (err) {
        logger.error('Failed to respond:', err);
        await workingMessage.reply({
          content: 'Something went wrong. Try again later.',
          allowedMentions: { parse: [], repliedUser: false },
        }).catch(() => {});
      }
    });
  });
}
