import Link from "next/link";

export default function DigestNotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Digest not found</h1>
        <p className="text-muted-foreground">
          No briefing exists for this date.
        </p>
        <Link
          href="/digest"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium
            border border-border/60 text-foreground hover:bg-muted/30 transition-colors"
        >
          View latest briefing
        </Link>
      </div>
    </div>
  );
}
