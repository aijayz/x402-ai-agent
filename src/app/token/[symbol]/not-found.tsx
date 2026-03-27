import Link from "next/link";

export default function TokenNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">Token Not Found</h1>
        <p className="text-muted-foreground">
          We don&apos;t have data for this token yet. Try one of our tracked tokens.
        </p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium
            bg-gradient-to-r from-blue-500/20 to-cyan-400/20
            border border-blue-500/30 hover:border-blue-500/50
            text-foreground hover:from-blue-500/30 hover:to-cyan-400/30
            transition-all duration-200"
        >
          Ask Obol AI instead
        </Link>
      </div>
    </div>
  );
}
