# Bort

A Discord bot powered by OpenAI's Responses API. Responds when @mentioned, maintains per-channel conversation context, and uses AI-driven tool calls to fetch Discord context only when needed.

## Setup

1. Copy `.env.example` to `.env` and fill in your tokens:
   ```
   DISCORD_TOKEN=your-discord-bot-token
   OPENAI_API_KEY=your-openai-api-key
   ```

2. Install and run:
   ```
   npm install
   npm run dev
   ```

3. Mention the bot in a Discord channel to start chatting.

## Configuration

- **`config/model.json`** — Model and API parameters (reasoning effort, verbosity, etc.)
- **`prompts/system.txt`** — The bot's personality/system prompt

Changes to these files take effect on restart (`node --watch` handles this automatically during dev).
