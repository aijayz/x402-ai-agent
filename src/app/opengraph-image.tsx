import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "x402 AI Agent - AI that pays for intelligence via x402";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
          fontFamily: "sans-serif",
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#fafafa",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            x402 AI Agent
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#a1a1aa",
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
            }}
          >
            AI agent that pays for intelligence
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <div
              style={{
                fontSize: 16,
                color: "#71717a",
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
              }}
            >
              x402 micropayments on Base and more
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
