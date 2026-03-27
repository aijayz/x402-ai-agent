import { ReportStore } from "@/lib/reports/report-store";
import { DigestViewer } from "./digest-viewer";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Daily Briefing — Obol AI",
  description: "Daily crypto market briefing powered by AI-synthesized on-chain data, whale flows, and sentiment analysis.",
  openGraph: {
    title: "Daily Briefing — Obol AI",
    description: "Daily crypto market briefing powered by AI-synthesized on-chain data.",
    type: "article",
    siteName: "Obol AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "Daily Briefing — Obol AI",
  },
};

export default async function DigestPage() {
  const report = await ReportStore.getLatestDigest();

  if (!report) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">No digest available yet</h1>
          <p className="text-muted-foreground">
            The first daily briefing will be published at 08:00 UTC.
          </p>
          <a
            href="/chat"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium
              bg-gradient-to-r from-blue-500/20 to-cyan-400/20
              border border-blue-500/30 hover:border-blue-500/50
              text-foreground transition-all duration-200"
          >
            Try Obol AI in the meantime
          </a>
        </div>
      </div>
    );
  }

  return <DigestViewer report={report} />;
}
