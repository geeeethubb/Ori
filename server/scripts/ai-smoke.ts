/** Minimal real request against the configured Anthropic model. Prints no secrets. */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config, resolveModelMode } from '../config.ts';

console.log(`model mode: ${resolveModelMode()} | model: ${config.anthropicModel} | key loaded from env/.env: ${Boolean(config.anthropicApiKey)}`);
if (!config.anthropicApiKey) {
  console.log('No ANTHROPIC_API_KEY available; sample mode would be used.');
  process.exit(2);
}
const client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: config.modelTimeoutMs, maxRetries: 1 });
const Schema = z.object({ greeting: z.string(), lucky_number: z.number() });
const started = Date.now();
try {
  const res = await client.messages.parse({
    model: config.anthropicModel,
    max_tokens: 256,
    output_config: { format: zodOutputFormat(Schema), effort: 'low' },
    messages: [{ role: 'user', content: 'Reply with the greeting "hello" and the lucky number 7.' }],
  });
  console.log(`stop_reason: ${res.stop_reason} | parsed: ${JSON.stringify(res.parsed_output)} | tokens in/out: ${res.usage.input_tokens}/${res.usage.output_tokens} | ${Date.now() - started} ms`);
  process.exit(res.parsed_output ? 0 : 1);
} catch (err) {
  if (err instanceof Anthropic.AuthenticationError) console.error('AUTH FAILED: the API key was rejected (401).');
  else if (err instanceof Anthropic.APIError) console.error(`API error ${err.status}: ${err.message}`);
  else console.error('Request failed:', (err as Error).message);
  process.exit(1);
}
