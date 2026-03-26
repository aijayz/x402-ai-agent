import { notFound } from "next/navigation";
import { ReportStore } from "@/lib/reports/report-store";
import { ReportViewer } from "./report-viewer";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const report = await ReportStore.getById(id);
  if (!report) return { title: "Report Not Found — Obol AI" };

  return {
    title: `${report.title} — Obol AI`,
    description: report.content.slice(0, 160).replace(/\[.*?\]/g, "").trim(),
    openGraph: {
      title: report.title,
      description: report.content.slice(0, 160).replace(/\[.*?\]/g, "").trim(),
      type: "article",
      siteName: "Obol AI",
    },
    twitter: {
      card: "summary_large_image",
      title: report.title,
    },
  };
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  const report = await ReportStore.getById(id);
  if (!report) notFound();

  return <ReportViewer report={report} />;
}
