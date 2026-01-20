import { Client, GatewayIntentBits } from 'discord.js';
import OpenAI from 'openai';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

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

  try {
    await message.channel.sendTyping();

    // Fetch recent channel history for context
    const history = await message.channel.messages.fetch({ limit: 10 });
    const messages = history
      .reverse()
      .filter((msg) => msg.id !== message.id) // Exclude current message
      .map((msg) => ({
        role: msg.author.id === client.user.id ? 'assistant' : 'user',
        content: msg.author.bot ? msg.content : `${msg.author.displayName}: ${msg.content}`,
      }));

    // Add current message
    messages.push({ role: 'user', content: `${message.author.displayName}: ${prompt}` });

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: 'You are Bort, a helpful bot in a Discord server full of developers. Be concise and conversational. You\'re a shared experiment — your code is in a repo anyone here can modify.' },
        ...messages,
      ],
      max_completion_tokens: 16384,
    });

    const reply = response.choices[0].message.content || '(No response)';

    // Discord has a 2000 char limit
    if (reply.length > 2000) {
      await message.reply(reply.slice(0, 1997) + '...');
    } else {
      await message.reply(reply);
    }
  } catch (error) {
    console.error('Error:', error);
    await message.reply('Something went wrong!');
  }
});

client.login(process.env.DISCORD_TOKEN);
