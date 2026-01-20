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

const GITHUB_ORG = 'haha-computer';

// Tool definitions for function calling
const tools = [
  {
    type: 'function',
    name: 'get_repo_info',
    description: 'Get information about a GitHub repository in our organization',
    parameters: {
      type: 'object',
      properties: {
        repo_name: {
          type: 'string',
          description: 'The name of the repository (e.g., "bort")',
        },
      },
      required: ['repo_name'],
    },
  },
];

// Execute a tool call
async function executeTool(name, args) {
  if (name === 'get_repo_info') {
    const { repo_name } = args;
    const headers = { 'User-Agent': 'Bort-Discord-Bot' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(`https://api.github.com/repos/${GITHUB_ORG}/${repo_name}`, { headers });
    if (!res.ok) {
      return { error: `Repository "${repo_name}" not found in ${GITHUB_ORG}` };
    }

    const repo = await res.json();
    return {
      name: repo.name,
      description: repo.description || 'No description',
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      language: repo.language,
      default_branch: repo.default_branch,
      updated_at: repo.updated_at,
      html_url: repo.html_url,
    };
  }
  return { error: 'Unknown tool' };
}

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
    const timings = {};
    const start = Date.now();

    // Quick call to pick a relevant thinking emoji (minimal reasoning for speed)
    const emojiResponse = await openai.responses.create({
      model: 'gpt-5-nano',
      instructions: 'Pick a single emoji that represents the topic of this message. Just respond with the emoji, nothing else.',
      input: prompt,
      reasoning: { effort: 'low' },
    });
    thinkingEmoji = emojiResponse.output_text?.trim() || '🧠';
    timings.emoji = Date.now() - start;

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

    // Use Responses API with function calling
    const instructions = 'You are Bort, a helpful bot in a Discord server full of developers. Be concise and conversational. You\'re a shared experiment — your code is in a repo anyone here can modify.';

    let llmStart = Date.now();
    let response = await openai.responses.create({
      model: 'gpt-5-mini',
      instructions,
      input,
      tools,
      reasoning: { effort: 'medium' },
      text: { verbosity: 'low' },
    });
    timings.firstLLM = Date.now() - llmStart;

    // Handle function calls (may need multiple rounds)
    let toolRound = 0;
    while (response.output.some((item) => item.type === 'function_call')) {
      toolRound++;
      const toolResults = [];

      for (const item of response.output) {
        if (item.type === 'function_call') {
          const toolStart = Date.now();
          const result = await executeTool(item.name, JSON.parse(item.arguments));
          timings[`tool_${toolRound}_${item.name}`] = Date.now() - toolStart;
          toolResults.push({
            type: 'function_call_output',
            call_id: item.call_id,
            output: JSON.stringify(result),
          });
        }
      }

      // Continue conversation with tool results (lower reasoning since we have the data)
      llmStart = Date.now();
      response = await openai.responses.create({
        model: 'gpt-5-mini',
        instructions,
        input: [...input, ...response.output, ...toolResults],
        tools,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' },
      });
      timings[`llm_round_${toolRound}`] = Date.now() - llmStart;
    }

    timings.total = Date.now() - start;
    console.log('Timings (ms):', timings);

    // Show typing indicator before sending reply
    await message.channel.sendTyping();

    const reply = response.output_text || '(No response)';

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
