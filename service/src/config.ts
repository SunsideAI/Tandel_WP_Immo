import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PROPSTACK_API_KEY: z.string().min(1),
  PROPSTACK_API_BASE: z.string().url().default('https://api.propstack.de/v1'),
  PROPSTACK_WEBHOOK_SECRET: z.string().min(16),

  WP_BRIDGE_BASE_URL: z.string().url(),
  WP_BRIDGE_API_KEY: z.string().min(16),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DRY_RUN: z.coerce.boolean().default(false),
  HMAC_ENFORCE: z.coerce.boolean().default(false),
  SYNC_FULL_API_KEY: z.string().min(16).optional(),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
