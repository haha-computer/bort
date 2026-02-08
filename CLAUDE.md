# Bort

Discord bot powered by OpenAI's gpt-5-nano via the **Responses API**.

## Quick reference

- **Run**: `npm run dev` (uses `node --watch`)
- **Entry point**: `src/index.js`
- **No build step** — ES modules throughout (`"type": "module"`)

## Architecture

```
src/
  index.js                  # Startup: loads env, creates Discord client, logs in
  config.js                 # Reads config/model.json + prompts/system.txt at startup
  discord/
    client.js               # Discord.js client factory (intents, partials)
    messages.js             # messageCreate handler — mention filtering, typing, reply splitting
  ai/
    openai-client.js        # Single function: getResponse(channelId, userMessage)
    conversation.js         # In-memory Map<channelId, responseId> for multi-turn chaining
  util/
    logger.js               # Console wrapper with timestamps and LOG_LEVEL support
```

## OpenAI Responses API (not Chat Completions)

This is critical — the bot uses the **Responses API**, which differs from Chat Completions:

- Endpoint: `client.responses.create()` — NOT `client.chat.completions.create()`
- Uses `instructions` param for the developer/system prompt (re-sent every request)
- Uses `previous_response_id` for multi-turn context (requires `store: true`)
- Uses `input` (string) for user messages — NOT a `messages` array
- gpt-5-nano is a reasoning model: uses `reasoning.effort` and `text.format`, NOT `temperature`/`top_p`
- Tool schemas are flat: `{type, name, description, parameters}` — not nested under `function`

## Configuration

- `config/model.json` — Model params spread directly into the API request. Change model, reasoning effort, etc. here.
- `prompts/system.txt` — Plain text developer prompt loaded once at startup.
- `.env` — `DISCORD_TOKEN`, `OPENAI_API_KEY` (never commit this)

## Conversation tracking

Per-channel `previous_response_id` stored in memory. Restarting the bot loses chain context (by design — keeps things simple). If the API returns 400 for a stale chain, it auto-clears and retries once.

## Adding tools

The extension point is `src/ai/openai-client.js`. Future tools go in a `src/tools/` directory. The Responses API tool loop pattern:

1. Add tool definitions to the `params.tools` array
2. Check `response.output` for items with `type: "function_call"`
3. Execute the tool, then call `client.responses.create()` again with the tool result and `previous_response_id`
4. Loop until no more tool calls

## Conventions

- No TypeScript, no build step
- Minimal dependencies — only discord.js, openai, dotenv
- Keep modules small and focused — one clear responsibility each
- Use the logger (`src/util/logger.js`), not raw `console.log`
