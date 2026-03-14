import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // EVM Wallet (self-managed private key)
    EVM_PRIVATE_KEY: z.string().startsWith("0x").optional(),
    EVM_NETWORK: z.enum(["base-sepolia", "base"]).default("base-sepolia"),

    // Solana Wallet (self-managed private key in base58)
    SVM_PRIVATE_KEY: z.string().optional(),
    SOLANA_NETWORK: z.enum(["devnet", "mainnet"]).default("devnet"),

    // CDP credentials (optional - for backwards compatibility)
    CDP_WALLET_SECRET: z.string().optional(),
    CDP_API_KEY_ID: z.string().optional(),
    CDP_API_KEY_SECRET: z.string().optional(),

    // AI Provider (DeepSeek)
    DEEPSEEK_API_KEY: z.string().optional(),

    NETWORK: z.enum(["base-sepolia", "base"]).default("base-sepolia"),
    URL: z.string().url().default("http://localhost:3000"),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: {
    EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
    EVM_NETWORK: process.env.EVM_NETWORK,
    SVM_PRIVATE_KEY: process.env.SVM_PRIVATE_KEY,
    SOLANA_NETWORK: process.env.SOLANA_NETWORK,
    CDP_WALLET_SECRET: process.env.CDP_WALLET_SECRET,
    CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    NETWORK: process.env.NETWORK,
    URL: process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
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
