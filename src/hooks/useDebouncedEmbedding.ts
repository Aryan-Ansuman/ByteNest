import { useState, useEffect, useRef, useCallback } from 'react';
import { computeContentHash, hashDelta } from '@/lib/similarity/utils/contentHash';
import { fetchDuplicateCandidates } from '@/lib/similarity/api/client';
import type { SimilarityCandidateUI } from '@/lib/similarity/types';

const TITLE_DEBOUNCE_MS = 1200;
const BODY_DEBOUNCE_MS = 2000;
const MIN_TITLE_CHARS = 20;
const MIN_COMBINED_CHARS = 50;
const HASH_DELTA_THRESHOLD = 0.3; // 30% change triggers refresh

export function useDebouncedEmbedding({ 
  title, 
  body, 
  tags, 
  onCandidatesReady 
}: { 
  title: string; 
  body: string; 
  tags: string[]; 
  onCandidatesReady?: (results: SimilarityCandidateUI[]) => void 
}) {
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bodyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHashRef = useRef<string | null>(null);
  const lastFiredContentRef = useRef({ title: '', body: '' });
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SimilarityCandidateUI[]>([]);

  // ── Step 10.3: gate check ────────────────────────────────────────────────
  const meetsThreshold = useCallback((t: string, b: string) => {
    return t.length >= MIN_TITLE_CHARS && (t + b).length >= MIN_COMBINED_CHARS;
  }, []);

  // ── Core: fire candidate request ─────────────────────────────────────────
  const fireCandidateRequest = useCallback(async (t: string, b: string, tgs: string[]) => {
    if (!meetsThreshold(t, b)) return;

    const currentHash = await computeContentHash(t, b, tgs);

    // Step 10.4: only proceed if content changed substantially
    if (lastHashRef.current) {
      const delta = hashDelta(lastHashRef.current, currentHash);
      if (delta < HASH_DELTA_THRESHOLD) return;
    }

    lastHashRef.current = currentHash;
    lastFiredContentRef.current = { title: t, body: b };

    setIsSearching(true);
    try {
      const results = await fetchDuplicateCandidates({ title: t, body: b, tags: tgs });
      setSuggestions(results);
      onCandidatesReady?.(results);
    } catch (err) {
      console.error('Candidate fetch failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, [meetsThreshold, onCandidatesReady]);

  // ── Step 10.2: title debounce (1200ms) ───────────────────────────────────
  useEffect(() => {
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      fireCandidateRequest(title, body, Array.from(tags));
    }, TITLE_DEBOUNCE_MS);

    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);   // fires on title change only

  // ── Step 10.2: body debounce (2000ms) ────────────────────────────────────
  useEffect(() => {
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(() => {
      fireCandidateRequest(title, body, Array.from(tags));
    }, BODY_DEBOUNCE_MS);

    return () => {
      if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);    // fires on body change only

  // tags change fires immediately after threshold check (no debounce needed —
  // tag changes are discrete clicks, not continuous keystrokes)
  useEffect(() => {
    if (!meetsThreshold(title, body)) return;
    fireCandidateRequest(title, body, Array.from(tags));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);

  return {
    suggestions,
    isSearching,
    setSuggestions,
  };
}
