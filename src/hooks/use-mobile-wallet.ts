"use client";

import { useEffect, useState } from "react";

/**
 * Detects iOS Safari without an injected wallet (window.ethereum).
 * Returns false during SSR and on first render to avoid hydration mismatch.
 *
 * MetaMask in-app browser injects window.ethereum → returns false → desktop flow.
 * iPad requesting desktop site sends "Macintosh" UA → returns false → desktop flow.
 */
export function useIsMobileSafariWithoutWallet(): boolean {
  const [isMobileSafari, setIsMobileSafari] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad)/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome|Edg/.test(ua);
    const hasWallet = typeof window.ethereum !== "undefined";

    setIsMobileSafari(isIOS && isSafari && !hasWallet);
  }, []);

  return isMobileSafari;
}
