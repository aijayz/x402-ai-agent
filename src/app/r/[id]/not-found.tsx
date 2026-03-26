import Link from "next/link";

export default function ReportNotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="text-6xl font-mono font-bold text-muted-foreground/30">404</div>
        <p className="text-muted-foreground">This report doesn&apos;t exist or has expired.</p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
            bg-gradient-to-r from-blue-500/20 to-cyan-400/20
            border border-blue-500/30 hover:border-blue-500/50
            text-foreground transition-all duration-200"
        >
          Try Obol AI
        </Link>
      </div>
    </div>
  );
}
