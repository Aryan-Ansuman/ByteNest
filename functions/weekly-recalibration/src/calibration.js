/**
 * Logistic regression via gradient descent.
 * Learns weights [wS, wI, wT, wC] that separate positives from negatives.
 * Weights are constrained to sum to 1 and stay non-negative.
 */
export function logisticRegressionWeights(positives, negatives, currentWeights) {
  const LEARNING_RATE = 0.01;
  const EPOCHS = 500;

  // Feature vector per sample: [semantic, intent, tag, community]
  const samples = [
    ...positives.map(d => ({ x: features(d), y: 1 })),
    ...negatives.map(d => ({ x: features(d), y: 0 })),
  ];

  // Initialize from current weights
  let w = [
    currentWeights.wSemantic,
    currentWeights.wIntent,
    currentWeights.wTag,
    currentWeights.wCommunity,
  ];

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const grad = [0, 0, 0, 0];
    for (const { x, y } of samples) {
      const score = dot(w, x);
      const pred  = sigmoid(score);
      const err   = pred - y;
      for (let i = 0; i < 4; i++) grad[i] += err * x[i];
    }
    for (let i = 0; i < 4; i++) {
      w[i] -= (LEARNING_RATE / samples.length) * grad[i];
      w[i]  = Math.max(0.01, w[i]); // keep positive
    }
    w = normalize(w); // enforce sum-to-1
  }

  return {
    wSemantic:   w[0],
    wIntent:     w[1],
    wTag:        w[2],
    wCommunity:  w[3],
  };
}

/**
 * Sweep thresholds from 0.5 to 0.9 and return the one maximizing F1.
 */
export function findF1Threshold(positives, negatives, weights) {
  const w = [weights.wSemantic, weights.wIntent, weights.wTag, weights.wCommunity];
  const allSamples = [
    ...positives.map(d => ({ score: dot(w, features(d)), y: 1 })),
    ...negatives.map(d => ({ score: dot(w, features(d)), y: 0 })),
  ];

  let bestF1 = 0, bestThreshold = 0.65;

  for (let t = 0.50; t <= 0.90; t += 0.01) {
    const tp = allSamples.filter(s => s.score >= t && s.y === 1).length;
    const fp = allSamples.filter(s => s.score >= t && s.y === 0).length;
    const fn = allSamples.filter(s => s.score <  t && s.y === 1).length;

    const precision = tp / (tp + fp || 1);
    const recall    = tp / (tp + fn || 1);
    const f1        = 2 * precision * recall / (precision + recall || 1);

    if (f1 > bestF1) { bestF1 = f1; bestThreshold = t; }
  }

  return Math.round(bestThreshold * 1000) / 1000; // 3 decimal places
}

// ── helpers ──────────────────────────────────────────────────────────────────
function features(doc) {
  return [doc.semanticScore, doc.intentScore, doc.tagScore, doc.communityScore];
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

function normalize(w) {
  const sum = w.reduce((s, v) => s + v, 0);
  return w.map(v => v / sum);
}
