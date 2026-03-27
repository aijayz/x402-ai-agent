"use client";

import { useEffect, useState } from "react";

/**
 * Detects mobile browsers without an injected wallet (window.ethereum).
 * Returns false during SSR and on first render to avoid hydration mismatch.
 *
 * MetaMask in-app browser injects window.ethereum → returns false → desktop flow.
 * iPad requesting desktop site sends "Macintosh" UA → returns false → desktop flow.
 */
export function useIsMobileWithoutWallet(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isMobileDevice = /iP(hone|ad)|Android|webOS|BlackBerry/i.test(ua)
      && !/Macintosh/.test(ua); // iPad desktop mode
    const hasWallet = typeof window.ethereum !== "undefined";

    setIsMobile(isMobileDevice && !hasWallet);
  }, []);

  return isMobile;
}
