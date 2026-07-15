import type {
  ConfidenceResult,
  DateSignal,
  PageMetadata,
  SignalSource,
} from '../types';
import { SIGNAL_WEIGHTS } from '../types';

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function calculateTimeSpanDays(dates: Date[]): number {
  if (dates.length < 2) return 0;
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  const ms =
    sorted[sorted.length - 1].getTime() - sorted[0].getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export function computeConfidence(
  metadata: PageMetadata,
): ConfidenceResult {
  const validSignals: DateSignal[] = metadata.signals.filter(
    (s) => s.date !== null,
  );

  if (validSignals.length === 0) {
    return {
      score: 0,
      level: 'low',
      earliestDate: null,
      latestDate: null,
      signals: metadata.signals,
    };
  }

  const parsedDates = validSignals
    .map((s) => parseDate(s.date))
    .filter((d): d is Date => d !== null);

  const timeSpanDays = calculateTimeSpanDays(parsedDates);
  const divergencePenalty =
    timeSpanDays > 365 ? 0.3 : timeSpanDays > 90 ? 0.15 : 0;

  let rawScore = 0;
  for (const signal of validSignals) {
    const weight = SIGNAL_WEIGHTS[signal.source as SignalSource] ?? 0;
    rawScore += weight * signal.reliability;
  }

  const score = Math.max(0, Math.min(1, rawScore - divergencePenalty));

  const sorted = [...parsedDates].sort(
    (a, b) => a.getTime() - b.getTime(),
  );

  return {
    score,
    level: getConfidenceLevel(score),
    earliestDate: sorted[0].toISOString(),
    latestDate: sorted[sorted.length - 1].toISOString(),
    signals: metadata.signals,
  };
}
