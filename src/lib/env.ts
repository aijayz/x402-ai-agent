import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // CDP credentials (required for payment operations)
    CDP_WALLET_SECRET: z.string().optional(),
    CDP_API_KEY_ID: z.string().optional(),
    CDP_API_KEY_SECRET: z.string().optional(),

    // AI Provider keys (for local dev — on Vercel use AI Gateway OIDC)
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),

    // AI Model configuration (format: provider/model)
    AI_MODEL: z.string().default("google/gemini-2.0-flash"),
    AI_REASONING_MODEL: z.string().default("deepseek/deepseek-reasoner"),

    // Network and URL
    NETWORK: z.enum(["base-sepolia", "base"]).default("base-sepolia"),
    URL: z.string().url().default("http://localhost:3000"),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: {
    CDP_WALLET_SECRET: process.env.CDP_WALLET_SECRET,
    CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    AI_REASONING_MODEL: process.env.AI_REASONING_MODEL,
    NETWORK: process.env.NETWORK,
    URL: process.env.URL,
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
