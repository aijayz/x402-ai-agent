"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { UIMessage } from "@ai-sdk/react";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface UseConversationsOptions {
  walletAddress: string | null;
}

export function useConversations({ walletAddress }: UseConversationsOptions) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSaveTimeRef = useRef<number>(Date.now());

  const headers = useMemo(
    () => walletAddress ? { "x-wallet-address": walletAddress } : undefined,
    [walletAddress],
  );

  /** Fetch conversation list */
  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setConversations([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/conversations", { headers });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error("[conversations] Failed to fetch list", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, headers]);

  /** Load a conversation's messages */
  const load = useCallback(async (id: string): Promise<UIMessage[] | null> => {
    if (!walletAddress) return null;
    try {
      const res = await fetch(`/api/conversations/${id}`, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      setActiveId(id);
      lastSaveTimeRef.current = Date.now();
      return data.conversation.messages as UIMessage[];
    } catch (err) {
      console.error("[conversations] Failed to load", err);
      return null;
    }
  }, [walletAddress, headers]);

  /** Save messages (debounced). Creates new conversation if no activeId or after 30min gap. */
  const save = useCallback((messages: UIMessage[]) => {
    if (!walletAddress || messages.length === 0) return;

    // Clear any pending save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // Auto-split: if >30min since last save, start a new conversation
    const IDLE_THRESHOLD_MS = 30 * 60 * 1000;
    const elapsed = Date.now() - lastSaveTimeRef.current;
    let saveId = activeId;
    if (saveId && elapsed > IDLE_THRESHOLD_MS) {
      saveId = null;
      setActiveId(null);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            id: saveId,
            messages,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!saveId) {
            setActiveId(data.id);
          }
          lastSaveTimeRef.current = Date.now();
          refresh();
        }
      } catch (err) {
        console.error("[conversations] Failed to save", err);
      }
    }, 1000); // 1s debounce
  }, [walletAddress, activeId, headers, refresh]);

  /** Start a new conversation (clear active) */
  const startNew = useCallback(() => {
    setActiveId(null);
  }, []);

  /** Search conversations (debounced server-side). Empty query reloads full list. */
  const search = useCallback((query: string) => {
    if (!walletAddress) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
        const res = await fetch(`/api/conversations${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations);
        }
      } catch (err) {
        console.error("[conversations] Failed to search", err);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [walletAddress, headers]);

  /** Delete a conversation */
  const remove = useCallback(async (id: string) => {
    if (!walletAddress) return;
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        headers,
      });
      if (activeId === id) setActiveId(null);
      refresh();
    } catch (err) {
      console.error("[conversations] Failed to delete", err);
    }
  }, [walletAddress, activeId, headers, refresh]);

  // Fetch conversations when wallet connects
  useEffect(() => {
    refresh();
  }, [walletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  return {
    conversations,
    activeId,
    loading,
    refresh,
    load,
    save,
    search,
    startNew,
    remove,
  };
}
