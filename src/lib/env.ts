import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // CDP credentials (required for payment operations)
    CDP_WALLET_SECRET: z.string().optional(),
    CDP_API_KEY_ID: z.string().optional(),
    CDP_API_KEY_SECRET: z.string().optional(),

    // AI Provider keys
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),

    // Default AI model (format: provider/model)
    AI_MODEL: z.string().default("deepseek/deepseek-chat"),

    // Network and URL
    NETWORK: z.enum(["base-sepolia", "base"]).default("base-sepolia"),
    URL: z.string().url().default("http://localhost:3000"),

    // Neon Postgres (required for credit system)
    DATABASE_URL: z.string().url(),

    // Cron authentication
    CRON_SECRET: z.string().optional(),

    // Alchemy webhook signature verification
    ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().optional(),

    // x402 service URLs (optional — real adapters use these on mainnet; stubs used on testnet)
    RUGMUNCH_URL: z.string().url().optional(),
    AUGUR_URL: z.string().url().optional(),
    DIAMONDCLAWS_URL: z.string().url().optional(),
    GENVOX_URL: z.string().url().optional(),
    QUANTUM_SHIELD_URL: z.string().url().optional(),
    SLAMAI_URL: z.string().url().optional(),
    MESSARI_URL: z.string().url().optional(),
    COINGECKO_URL: z.string().url().optional(),

    // Upstash Redis (Edge runtime compatible — used for rate limiting)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_NETWORK: z.enum(["base-sepolia", "base"]).default("base-sepolia"),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: {
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
    CDP_WALLET_SECRET: process.env.CDP_WALLET_SECRET,
    CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    NETWORK: process.env.NETWORK,
    URL: process.env.URL,
    DATABASE_URL: process.env.DATABASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    ALCHEMY_WEBHOOK_SIGNING_KEY: process.env.ALCHEMY_WEBHOOK_SIGNING_KEY,
    RUGMUNCH_URL: process.env.RUGMUNCH_URL,
    AUGUR_URL: process.env.AUGUR_URL,
    DIAMONDCLAWS_URL: process.env.DIAMONDCLAWS_URL,
    GENVOX_URL: process.env.GENVOX_URL,
    QUANTUM_SHIELD_URL: process.env.QUANTUM_SHIELD_URL,
    SLAMAI_URL: process.env.SLAMAI_URL,
    MESSARI_URL: process.env.MESSARI_URL,
    COINGECKO_URL: process.env.COINGECKO_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  },

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,

  /**
   * Skip validation during build time to allow building without all env vars
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
