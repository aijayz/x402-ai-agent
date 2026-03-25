"use client";

import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // we track custom events only
  });
  initialized = true;
}

/** Identify a user by wallet address. */
export function identifyUser(walletAddress: string) {
  if (!initialized) return;
  posthog.identify(walletAddress);
}

/** Reset identity (disconnect wallet). */
export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

/** Track a custom event. */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
