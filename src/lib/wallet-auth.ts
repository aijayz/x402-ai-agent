import { createHmac } from "crypto";

const COOKIE_NAME = "wallet_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

/** Create a signed wallet auth cookie value */
export function signWalletCookie(walletAddress: string): string {
  const addr = walletAddress.toLowerCase();
  const sig = hmac(addr);
  return `${addr}:${sig}`;
}

/** Verify a wallet auth cookie and return the address, or null if invalid */
export function verifyWalletCookie(cookieValue: string): string | null {
  const parts = cookieValue.split(":");
  if (parts.length !== 2) return null;
  const [addr, sig] = parts;
  if (!addr || !sig) return null;
  const expected = hmac(addr);
  // Constant-time comparison to prevent timing attacks
  if (sig.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return null;
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
