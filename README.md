# Bort

A shared Discord bot for our developer crew. Bort uses OpenAI's gpt-5-mini model to chat in Discord.

## How it works

- Mention `@Bort` or use `!ask <message>` to talk to it
- Bort sees the last 10 messages in the channel for context
- Responses are truncated at 2000 chars (Discord's limit)

## Local development

```bash
# Install dependencies
npm install

# Create .env from the example
cp .env.example .env
# Fill in DISCORD_TOKEN and OPENAI_API_KEY

# Run the bot
node --env-file=.env bot.js
```

## Deployment

Bort runs on Fly.io and auto-deploys when you push to `master`.

```bash
# Manual deploy if needed
fly deploy

# Check logs
fly logs

# Set secrets (already configured)
fly secrets set DISCORD_TOKEN=xxx OPENAI_API_KEY=xxx
```

## Project structure

```
bot.js          # The whole bot (~80 lines)
fly.toml        # Fly.io config
package.json    # Dependencies (discord.js, openai)
.env.example    # Environment variable template
```

## Contributing

This is a shared experiment. Fork it, break it, make it weird. Some ideas:

- Change the system prompt in `bot.js` (line 62)
- Add new commands beyond `!ask`
- Add tool use / function calling
- Make Bort remember things

Push to `master` and it deploys. If you break it, you fix it (or ask for help).
