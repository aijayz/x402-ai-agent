/** Extract structured markers from content for OG image / previews */
export function extractMarkers(content: string): unknown[] {
  const markers: unknown[] = [];
  const re = /\[METRIC:([^|\]]+)\|([^|\]]+)(?:\|([^|\]]*))?]|\[VERDICT:([^|]+)\|(\w+)]|\[SCORE:([^|]+)\|(\d+)\/(\d+)(?:\|(\w+))?]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1] != null) {
      markers.push({ type: "metric", label: m[1].trim(), value: m[2].trim(), change: m[3]?.trim() || undefined });
    } else if (m[4] != null) {
      markers.push({ type: "verdict", text: m[4].trim(), color: m[5].trim().toLowerCase() });
    } else {
      markers.push({ type: "score", label: m[6].trim(), value: Number(m[7]), max: Number(m[8]), invert: m[9]?.trim().toLowerCase() === "green" });
    }
  }
  return markers;
}

/** Extract a title from report content */
export function extractTitle(content: string): string {
  // Try VERDICT marker
  const verdictMatch = content.match(/\[VERDICT:([^|]+)\|/);
  if (verdictMatch) return verdictMatch[1].trim().slice(0, 100);

  // Try first bold line
  const boldMatch = content.match(/\*\*([^*]+)\*\*/);
  if (boldMatch) return boldMatch[1].trim().slice(0, 100);

  // Fallback
  return `Obol Analysis — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}
