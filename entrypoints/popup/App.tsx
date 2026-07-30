import { useEffect, useState } from 'react';
import type { ConfidenceResult, DateSignal } from '../../src/types';
import { SIGNAL_LABELS, SIGNAL_WEIGHTS } from '../../src/types';
import { formatAge, formatDate } from '../../src/utils/age';

const LEVEL_STYLES: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

const LEVEL_TEXT: Record<string, string> = {
  high: 'High Confidence',
  medium: 'Medium Confidence',
  low: 'Low Confidence',
};

function SignalRow({ signal }: { signal: DateSignal }) {
  const label = SIGNAL_LABELS[signal.source] ?? signal.source;
  const weight = SIGNAL_WEIGHTS[signal.source] ?? 0;
  const has = signal.date !== null;

  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${has ? 'bg-emerald-400' : 'bg-zinc-600'}`}
        />
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-600 text-xs">{Math.round(weight * 100)}%</span>
      </div>
      <span className="text-zinc-400 text-xs font-mono">
        {has ? formatDate(signal.date) : '—'}
      </span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full transition-all duration-500"
        style={{ width: `${Math.round(score * 100)}%` }}
      />
    </div>
  );
}

export default function App() {
  const [result, setResult] = useState<ConfidenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          setError('No active tab found');
          setLoading(false);
          return;
        }
        if (!tab.url?.startsWith('http')) {
          setLoading(false);
          console.log('serverless page')
          return;
        } else if (tab.url) {
          setUrl(tab.url);
          console.log(tab.url)
        }


        browser.tabs.sendMessage(tab.id, { type: 'GET_METADATA' }, (response) => {
          if (browser.runtime.lastError) {
            setError('Could not connect to page');
            setLoading(false);
            return;
          }
          if (response) {
            setResult(response);
          }
          setLoading(false);


        });
      } catch {
        setError('Extension error');
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="w-[360px] p-6 bg-zinc-950 text-white flex items-center justify-center min-h-[200px]">
        <div className="text-zinc-400 animate-pulse">Scanning page...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (url?.startsWith('chrome://')) {
    return (
      <div className='w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]'>
        <div className='text-violet-500 text-sm'>Built-in internal page Detected</div>
      </div>
    )
  } else if (url?.startsWith('file://')) {
    return (
      <div className='w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]'>
        <div className='text-zinc-500 text-sm'>file storage link detected</div>
      </div>
    )
  } else if (url?.startsWith('about:')) {
    return (
      <div className='w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]'>
        <div className='text-zinc-500 text-sm'>about:blank page detected</div>
      </div>
    )
  }



  if (!result) {
    return (
      <div className="w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]">
        <div className="text-zinc-500 text-sm">No data available</div>
      </div>
    );
  }

  return (
    <div className="w-[360px] p-5 bg-zinc-950 text-white font-sans">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-lg font-bold tracking-tight">Tracer</div>
        <span className="text-zinc-600 text-xs">v0.1.0</span>
      </div>

      <div className="mb-4">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
          Oldest Detected
        </div>
        <div className="text-xl font-mono font-semibold text-white">
          {formatAge(result.earliestDate)}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {formatDate(result.earliestDate)}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">
            Confidence
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${LEVEL_STYLES[result.level]}`}
          >
            {LEVEL_TEXT[result.level]} ({Math.round(result.score * 100)}%)
          </span>
        </div>
        <ScoreBar score={result.score} />
      </div>

      <div className="mb-2">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
          Data Sources
        </div>
        {result.signals.map((signal) => (
          <SignalRow key={signal.source} signal={signal} />
        ))}
      </div>
    </div>
  );
}
