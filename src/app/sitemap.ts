import type { MetadataRoute } from "next";
import { TokenSnapshotStore } from "@/lib/token-pages/store";
import { env } from "@/lib/env";

const BASE_URL = env.URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/chat`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/digest`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  ];

  let tokenPages: MetadataRoute.Sitemap = [];
  try {
    const symbols = await TokenSnapshotStore.getAllSymbols();
    tokenPages = symbols.map((symbol) => ({
      url: `${BASE_URL}/token/${symbol}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error("[SITEMAP] Failed to fetch token symbols:", err);
  }

  return [...staticPages, ...tokenPages];
}
