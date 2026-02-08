import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

export const modelConfig = JSON.parse(
  readFileSync(join(root, 'config', 'model.json'), 'utf-8')
);

export const systemPrompt = readFileSync(
  join(root, 'prompts', 'system.txt'), 'utf-8'
).trim();
