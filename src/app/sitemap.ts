import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

const BASE_URL = env.URL;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/chat`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
  ];
}
