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
    openai-client.js        # getResponse() with tool loop support
    conversation.js         # In-memory Map<channelId, responseId> for multi-turn chaining
  tools/
    definitions.js          # Tool schemas (get_channel_history, get_reply_chain)
    executors.js            # createToolExecutors(message) — Discord-bound tool implementations
    index.js                # Barrel export
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

- `config/model.json` — Model params (spread into the API request) plus bot settings under `bort`.
- `prompts/system.txt` — Plain text developer prompt loaded once at startup.
- `.env` — `DISCORD_TOKEN`, `OPENAI_API_KEY` (never commit this)

## Conversation tracking

Per-channel `previous_response_id` stored in memory with TTL + max size from `config/model.json`. Restarting the bot loses chain context (by design — keeps things simple). If the API returns 400 for a stale chain, it auto-clears and retries once.

## Tools

The AI decides when to fetch Discord context via tool calls — no pre-fetching. Built-in tools:

- **`get_channel_history`** — fetches recent channel messages (1-30, default 15)
- **`get_reply_chain`** — walks the reply chain backwards (1-10, default 5)

Tool definitions live in `src/tools/definitions.js`, implementations in `src/tools/executors.js`. The `openai-client.js` tool loop is generic — it accepts any tool definitions and executor map.

### Adding new tools

1. Add the definition to `src/tools/definitions.js` (flat schema: `{type, name, description, parameters}`)
2. Add the executor to `src/tools/executors.js` inside `createToolExecutors()`
3. That's it — `openai-client.js` handles the loop automatically (max 5 iterations)

## Conventions

- No TypeScript, no build step
- Minimal dependencies — only discord.js, openai, dotenv
- Keep modules small and focused — one clear responsibility each
- Use the logger (`src/util/logger.js`), not raw `console.log`
