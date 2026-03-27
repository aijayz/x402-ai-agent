import { notFound } from "next/navigation";
import { ReportStore } from "@/lib/reports/report-store";
import { DigestViewer } from "../digest-viewer";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ date: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { title: "Invalid Date — Obol AI" };

  const displayDate = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    title: `Daily Briefing — ${displayDate} — Obol AI`,
    description: `Obol AI daily crypto market briefing for ${displayDate}.`,
    openGraph: {
      title: `Daily Briefing — ${displayDate}`,
      description: `AI-synthesized crypto market briefing for ${displayDate}.`,
      type: "article",
      siteName: "Obol AI",
    },
    twitter: {
      card: "summary_large_image",
      title: `Daily Briefing — ${displayDate} — Obol AI`,
    },
  };
}

export default async function DigestDatePage({ params }: Props) {
  const { date } = await params;

  if (!DATE_RE.test(date)) notFound();

  const report = await ReportStore.getDigestByDate(date);
  if (!report) notFound();

  return <DigestViewer report={report} />;
}
