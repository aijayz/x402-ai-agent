import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Obol AI - AI agent that pays for intelligence via x402";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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
            alignItems: "center",
            gap: 56,
          }}
        >
          {/* Icon - ring with line */}
          <svg
            width="160"
            height="160"
            viewBox="0 0 32 32"
            style={{ flexShrink: 0 }}
          >
            <defs>
              <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <circle
              cx="16"
              cy="16"
              r="9.5"
              fill="none"
              stroke="url(#g)"
              strokeWidth="3.5"
            />
            <line
              x1="4"
              y1="16"
              x2="28"
              y2="16"
              stroke="url(#g)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>

          {/* Text */}
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
              Obol AI
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
      </div>
    ),
    { ...size }
  );
}
