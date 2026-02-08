import 'dotenv/config';
import { createClient } from './discord/client.js';
import { registerMessageHandler } from './discord/messages.js';
import { logger } from './util/logger.js';

const client = createClient();

registerMessageHandler(client);

client.once('clientReady', () => {
  logger.info(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
