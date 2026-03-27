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

/**
 * Post a thread (reply chain). Handles 1+ tweets.
 * Returns the ID of the first tweet, or null if posting is disabled.
 */
export async function postThread(tweets: string[]): Promise<string | null> {
  if (
    !env.TWITTER_API_KEY ||
    !env.TWITTER_API_SECRET ||
    !env.TWITTER_ACCESS_TOKEN ||
    !env.TWITTER_ACCESS_SECRET ||
    tweets.length === 0
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

    // Post first tweet
    const first = await client.v2.tweet(tweets[0]);
    const firstId = first.data.id;
    console.log(`[TWITTER] Posted thread start ${firstId}`);

    // Post replies
    let lastId = firstId;
    for (let i = 1; i < tweets.length; i++) {
      const reply = await client.v2.tweet(tweets[i], {
        reply: { in_reply_to_tweet_id: lastId },
      });
      lastId = reply.data.id;
      console.log(`[TWITTER] Posted thread reply ${i}/${tweets.length - 1}: ${lastId}`);
    }

    return firstId;
  } catch (err) {
    console.error("[TWITTER] Failed to post thread", err);
    return null;
  }
}
