import { TwitterApi } from "twitter-api-v2";
import { env } from "@/lib/env";

function getClient(): TwitterApi | null {
  if (
    !env.TWITTER_API_KEY ||
    !env.TWITTER_API_SECRET ||
    !env.TWITTER_ACCESS_TOKEN ||
    !env.TWITTER_ACCESS_SECRET
  ) {
    return null;
  }
  return new TwitterApi({
    appKey: env.TWITTER_API_KEY,
    appSecret: env.TWITTER_API_SECRET,
    accessToken: env.TWITTER_ACCESS_TOKEN,
    accessSecret: env.TWITTER_ACCESS_SECRET,
  });
}

/** Post a tweet with an optional image. Returns the tweet ID on success. */
export async function postTweet(text: string, imageUrl?: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    let mediaId: string | undefined;

    if (imageUrl) {
      // Fetch image and upload via v1 media endpoint
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        mediaId = await client.v1.uploadMedia(buffer, { mimeType: "image/png" });
      } else {
        console.warn(`[TWITTER] Failed to fetch image: ${imgRes.status}`);
      }
    }

    const tweetPayload: Record<string, unknown> = { text };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const { data } = await client.v2.tweet(tweetPayload);
    console.log(`[TWITTER] Posted tweet ${data.id}`);
    return data.id;
  } catch (err) {
    console.error("[TWITTER] Failed to post tweet", err);
    return null;
  }
}
