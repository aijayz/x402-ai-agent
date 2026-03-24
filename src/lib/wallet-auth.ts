import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "wallet_auth";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const MAX_AGE_MS = MAX_AGE * 1000;

function getSecret(): string {
  // Use DATABASE_URL as HMAC key — it's always present and secret.
  // This avoids adding yet another env var. If DATABASE_URL changes,
  // all wallet sessions are invalidated (acceptable).
  const secret = process.env.DATABASE_URL;
  if (!secret) throw new Error("DATABASE_URL required for wallet auth");
  return secret;
}

function hmac(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

/** Create a signed wallet auth cookie value (includes issued-at timestamp) */
export function signWalletCookie(walletAddress: string): string {
  const addr = walletAddress.toLowerCase();
  const iat = Date.now().toString(36);
  const sig = hmac(`${addr}:${iat}`);
  return `${addr}:${iat}:${sig}`;
}

/** Verify a wallet auth cookie and return the address, or null if invalid/expired */
export function verifyWalletCookie(cookieValue: string): string | null {
  const parts = cookieValue.split(":");
  if (parts.length !== 3) return null;
  const [addr, iat, sig] = parts;
  if (!addr || !iat || !sig) return null;

  // Check expiry
  const issuedAt = parseInt(iat, 36);
  if (isNaN(issuedAt) || Date.now() - issuedAt > MAX_AGE_MS) return null;

  const expected = hmac(`${addr}:${iat}`);
  // Constant-time comparison to prevent timing attacks
  if (sig.length !== expected.length) return null;
  try {
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }
  return addr;
}

/** Build Set-Cookie header string for wallet auth */
export function walletAuthSetCookie(walletAddress: string): string {
  const value = signWalletCookie(walletAddress);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

/** Build Set-Cookie header string to clear wallet auth */
export function walletAuthClearCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** Extract and verify wallet address from request cookies */
export function getVerifiedWallet(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/wallet_auth=([^;]+)/);
  if (!match) return null;
  return verifyWalletCookie(match[1]);
}
