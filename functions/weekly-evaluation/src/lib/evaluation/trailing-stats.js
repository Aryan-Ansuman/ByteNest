export function computeTrailingStats(snapshots, metricKey) {
  const values = snapshots
    .map(s => s[metricKey])
    .filter(v => typeof v === 'number' && !isNaN(v));

  if (values.length === 0) return { mean: 0, std: 0 };

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;

  return { mean, std: Math.sqrt(variance) };
}

const METRIC_KEYS = [
  'duplicatePreventionRate',
  'precisionAt3',
  'falsePositiveRate',
  'suggestionCTR',
  'postingAbandonmentRate',
];

const ALERT_THRESHOLD_STD = 2.0;

export function detectAlerts(currentMetrics, trailingSnapshots) {
  const alertReasons = [];

  for (const key of METRIC_KEYS) {
    const { mean, std } = computeTrailingStats(trailingSnapshots, key);
    if (std === 0) continue; // not enough variance to alert

    const current   = currentMetrics[key];
    const deviation = Math.abs(current - mean) / std;

    if (deviation > ALERT_THRESHOLD_STD) {
      const direction = current > mean ? 'above' : 'below';
      alertReasons.push(
        `${key} is ${direction} trailing average by ${deviation.toFixed(1)} std devs ` +
        `(current: ${current.toFixed(3)}, trailing mean: ${mean.toFixed(3)})`
      );
    }
  }

  return alertReasons;
}

export function buildTrailingStatsPayload(trailingSnapshots) {
  const payload = {};

  for (const key of METRIC_KEYS) {
    const capitalised = key.charAt(0).toUpperCase() + key.slice(1);
    const { mean, std } = computeTrailingStats(trailingSnapshots, key);
    payload[`trailingAvg${capitalised}`] = mean;
    payload[`trailingStd${capitalised}`] = std;
  }

  return payload;
}
