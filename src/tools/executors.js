import { logger } from '../util/logger.js';

/**
 * Resolve mention markup in a message's content to readable @names.
 * Collects discovered name→id mappings into the provided map.
 */
function resolveContentMentions(msg, nameToId) {
  return msg.content.replace(/<@!?(\d+)>/g, (match, id) => {
    const member = msg.guild?.members.cache.get(id);
    if (member) {
      nameToId.set(member.displayName, id);
      return `@${member.displayName}`;
    }
    const user = msg.client.users.cache.get(id);
    if (user) {
      nameToId.set(user.username, id);
      return `@${user.username}`;
    }
    return match;
  });
}

/**
 * Format a single message as a transcript line.
 */
function formatMessage(msg, nameToId) {
  const content = resolveContentMentions(msg, nameToId);
  const tag = msg.author.bot ? `${msg.author.username} [bot]` : msg.author.username;
  return `[${tag}]: ${content}`;
}

/**
 * Create tool executor functions bound to a Discord message.
 * Returns { executors, getDiscoveredMentions }.
 */
export function createToolExecutors(message) {
  const discoveredMentions = new Map();

  const executors = {
    async get_channel_history(args = {}) {
      const count = Math.min(30, Math.max(1, args.count ?? 15));
      logger.info(`Tool: get_channel_history(count=${count}) in #${message.channel.name ?? 'unknown'}`);

      const messages = await message.channel.messages.fetch({
        limit: count,
        before: message.id,
      });

      if (messages.size === 0) return 'No recent messages found.';

      const lines = [...messages.values()]
        .reverse()
        .map((msg) => formatMessage(msg, discoveredMentions));

      return lines.join('\n');
    },

    async get_reply_chain(args = {}) {
      const maxDepth = Math.min(10, Math.max(1, args.max_depth ?? 5));
      logger.info(`Tool: get_reply_chain(max_depth=${maxDepth}) in #${message.channel.name ?? 'unknown'}`);

      const chain = [];
      let current = message;

      for (let i = 0; i < maxDepth; i++) {
        if (!current.reference?.messageId) break;
        try {
          current = await current.channel.messages.fetch(current.reference.messageId);
          chain.push(formatMessage(current, discoveredMentions));
        } catch {
          logger.warn(`Could not fetch reply chain message ${current.reference.messageId}`);
          break;
        }
      }

      if (chain.length === 0) return 'No reply chain found.';

      // Return oldest-first
      return chain.reverse().join('\n');
    },
  };

  return {
    executors,
    getDiscoveredMentions() {
      return discoveredMentions;
    },
  };
}
