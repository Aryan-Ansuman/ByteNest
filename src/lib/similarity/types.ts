export type SimilarityCandidateUI = {
  candidateId: string;
  title: string;
  url: string;
  hybridScore: number;
  explanationTokens?: string[];
  scores: {
    semantic: number;
    intent: number | null;
    tag: number;
    community: number;
    hybrid: number;
  };
};

export type SimilarityRequest = {
  draftTitle?: string;
  draftBody?: string;
  draftTags?: string[];
  questionId?: string;
};

export type SimilarityResult = {
  consumerId: string;
  candidates: SimilarityCandidateUI[];
  computedAt: Date;
  servedFromCache: boolean;
};

export type ConsumerConfig = {
  id: string;
  latencyBudgetMs: number;
};
