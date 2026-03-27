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

    // Alchemy webhook signature verification (per-chain)
    ALCHEMY_WEBHOOK_KEY_BASE: z.string().optional(),
    ALCHEMY_WEBHOOK_KEY_ETHEREUM: z.string().optional(),
    ALCHEMY_WEBHOOK_KEY_ARBITRUM: z.string().optional(),
    ALCHEMY_WEBHOOK_KEY_OPTIMISM: z.string().optional(),

    // x402 service URLs (optional — real adapters use these on mainnet; stubs used on testnet)
    AUGUR_URL: z.string().url().optional(),
    GENVOX_URL: z.string().url().optional(),
    SLAMAI_URL: z.string().url().optional(),
    QUANTUM_SHIELD_URL: z.string().url().optional(),
    MESSARI_URL: z.string().url().optional(),
    COINGECKO_URL: z.string().url().optional(),

    // Telegram alerts
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),

    // Twitter/X auto-posting
    TWITTER_API_KEY: z.string().optional(),
    TWITTER_API_SECRET: z.string().optional(),
    TWITTER_ACCESS_TOKEN: z.string().optional(),
    TWITTER_ACCESS_SECRET: z.string().optional(),

    // Upstash Redis (Edge runtime compatible — used for rate limiting)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Dune Analytics (optional — temporal on-chain data)
    DUNE_API_KEY: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_NETWORK: z.enum(["base-sepolia", "base"]).default("base-sepolia"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: {
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
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
    ALCHEMY_WEBHOOK_KEY_BASE: process.env.ALCHEMY_WEBHOOK_KEY_BASE,
    ALCHEMY_WEBHOOK_KEY_ETHEREUM: process.env.ALCHEMY_WEBHOOK_KEY_ETHEREUM,
    ALCHEMY_WEBHOOK_KEY_ARBITRUM: process.env.ALCHEMY_WEBHOOK_KEY_ARBITRUM,
    ALCHEMY_WEBHOOK_KEY_OPTIMISM: process.env.ALCHEMY_WEBHOOK_KEY_OPTIMISM,
    AUGUR_URL: process.env.AUGUR_URL,
    GENVOX_URL: process.env.GENVOX_URL,
    SLAMAI_URL: process.env.SLAMAI_URL,
    QUANTUM_SHIELD_URL: process.env.QUANTUM_SHIELD_URL,
    MESSARI_URL: process.env.MESSARI_URL,
    COINGECKO_URL: process.env.COINGECKO_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    TWITTER_API_KEY: process.env.TWITTER_API_KEY,
    TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    DUNE_API_KEY: process.env.DUNE_API_KEY,
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
