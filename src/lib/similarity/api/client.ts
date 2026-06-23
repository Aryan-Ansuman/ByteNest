export async function fetchDuplicateCandidates(params: { title: string; body: string; tags: string[] }) {
  const response = await fetch('/api/questions/candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) throw new Error(`Candidate fetch failed: ${response.status}`);

  const data = await response.json();
  return data.suggestions ?? [];
}

export async function recordFeedbackClient(params: {
  sessionId: string;
  action: string;
  suggestedCandidateId?: string;
  rank?: number;
  sourceQuestionTitle?: string;
  count?: number;
  scores?: any;
  explanationTokens?: string[];
}) {
  try {
    await fetch('/api/similarity/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch (err) {
    console.error("Failed to record feedback:", err);
  }
}
