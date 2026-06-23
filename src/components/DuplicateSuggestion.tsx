import React, { useState } from 'react';
import type { SimilarityCandidateUI } from '@/lib/similarity/types';
import Link from 'next/link';
import { ExternalLink, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function DuplicateSuggestion({
  suggestion,
  rank,
  onAction,
}: {
  suggestion: SimilarityCandidateUI;
  rank: number;
  onAction: (action: { type: string; candidateId: string; rank: number; scores: any; explanationTokens?: string[] }) => void;
}) {
  const router = useRouter();

  const handleAccept = () => {
    onAction({ type: 'clicked_did_not_post', candidateId: suggestion.candidateId, rank, scores: suggestion.scores, explanationTokens: suggestion.explanationTokens });
    router.push(suggestion.url);
  };

  const handleReject = () => {
    onAction({ type: 'explicitly_rejected', candidateId: suggestion.candidateId, rank, scores: suggestion.scores, explanationTokens: suggestion.explanationTokens });
  };

  return (
    <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm transition-all hover:border-slate-500">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Link
            href={suggestion.url}
            target="_blank"
            onClick={() => onAction({ type: 'clicked_abandoned', candidateId: suggestion.candidateId, rank, scores: suggestion.scores, explanationTokens: suggestion.explanationTokens })}
            className="flex items-center text-sm font-medium text-blue-400 hover:text-blue-300 hover:underline"
          >
            {suggestion.title}
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
          
          {suggestion.explanationTokens && suggestion.explanationTokens.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Why this matches: </span>
              {suggestion.explanationTokens.join(' • ')}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              className="flex items-center rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
            >
              <Check className="mr-1.5 h-3 w-3" />
              This answers my question
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="flex items-center rounded-md bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-300"
            >
              <X className="mr-1.5 h-3 w-3" />
              Not what I&apos;m asking
            </button>
          </div>
        </div>
        
        <div className="ml-4 flex shrink-0 flex-col items-end">
          <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-slate-300 ring-1 ring-inset ring-slate-700">
            {(suggestion.hybridScore * 100).toFixed(0)}% Match
          </span>
        </div>
      </div>
    </div>
  );
}
