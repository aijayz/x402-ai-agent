import { TwitterApi } from "twitter-api-v2";
import { env } from "@/lib/env";

/** Post a tweet. No-ops if env vars are missing. Returns the tweet ID on success. */
export async function postTweet(text: string): Promise<string | null> {
  if (
    !env.TWITTER_API_KEY ||
    !env.TWITTER_API_SECRET ||
    !env.TWITTER_ACCESS_TOKEN ||
    !env.TWITTER_ACCESS_SECRET
  ) {
    return null;
  }

  try {
    const client = new TwitterApi({
      appKey: env.TWITTER_API_KEY,
      appSecret: env.TWITTER_API_SECRET,
      accessToken: env.TWITTER_ACCESS_TOKEN,
      accessSecret: env.TWITTER_ACCESS_SECRET,
    });

    const { data } = await client.v2.tweet(text);
    console.log(`[TWITTER] Posted tweet ${data.id}`);
    return data.id;
  } catch (err) {
    console.error("[TWITTER] Failed to post tweet", err);
    return null;
  }
}
