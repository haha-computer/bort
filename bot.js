import { Client, GatewayIntentBits } from 'discord.js';
import OpenAI from 'openai';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

const ALLOWED_SERVERS = new Set([
  '1462907431888617494',
]);

client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Redirect DMs back to the group chat
  if (!message.guild) {
    await message.reply("I'm more of a public spectacle. Find me back in the server!");
    return;
  }

  // Only respond in allowed servers
  if (!ALLOWED_SERVERS.has(message.guild.id)) return;

  // Respond when mentioned or when message starts with !ask
  const isMentioned = message.mentions.has(client.user);
  const isCommand = message.content.startsWith('!ask');

  if (!isMentioned && !isCommand) return;

  // Extract the prompt
  let prompt = message.content;
  if (isCommand) {
    prompt = message.content.slice(4).trim();
  } else {
    prompt = message.content.replace(/<@!?\d+>/g, '').trim();
  }

  if (!prompt) {
    await message.reply('Please provide a message!');
    return;
  }

  let thinkingEmoji = '🧠';

  try {
    // Quick call to pick a relevant thinking emoji
    const emojiResponse = await openai.responses.create({
      model: 'gpt-5-nano',
      instructions: 'Pick a single emoji that represents the topic of this message. Just respond with the emoji, nothing else.',
      input: prompt,
    });
    thinkingEmoji = emojiResponse.output_text?.trim() || '🧠';

    // React with the chosen emoji to show we're thinking
    await message.react(thinkingEmoji);

    // Fetch recent channel history for context
    const history = await message.channel.messages.fetch({ limit: 10 });
    const input = history
      .reverse()
      .filter((msg) => msg.id !== message.id) // Exclude current message
      .map((msg) => ({
        role: msg.author.id === client.user.id ? 'assistant' : 'user',
        content: msg.author.bot ? msg.content : `${msg.author.displayName}: ${msg.content}`,
      }));

    // Add current message
    input.push({ role: 'user', content: `${message.author.displayName}: ${prompt}` });

    // Use Responses API with streaming to detect thinking vs response phases
    const stream = await openai.responses.create({
      model: 'gpt-5-mini',
      instructions: 'You are Bort, a helpful bot in a Discord server full of developers. Be concise and conversational. You\'re a shared experiment — your code is in a repo anyone here can modify.',
      input: input,
      reasoning: { effort: 'medium' },
      stream: true,
    });

    let reply = '';
    let isReasoning = true;

    for await (const event of stream) {
      // Output text events = actual response content
      if (event.type === 'response.output_text.delta') {
        // First output token - switch from thinking to typing
        if (isReasoning) {
          isReasoning = false;
          // Show typing indicator (emoji stays as a topic marker)
          await message.channel.sendTyping();
        }
        reply += event.delta;
      }
      // Reasoning events keep the brain emoji visible (no action needed)
    }

    reply = reply || '(No response)';

    // Discord has a 2000 char limit
    if (reply.length > 2000) {
      await message.reply(reply.slice(0, 1997) + '...');
    } else {
      await message.reply(reply);
    }
  } catch (error) {
    console.error('Error:', error);
    // Clean up the thinking emoji if it's still there
    await message.reactions.cache.get(thinkingEmoji)?.users.remove(client.user.id);
    await message.reply('Something went wrong!');
  }
});

client.login(process.env.DISCORD_TOKEN);
