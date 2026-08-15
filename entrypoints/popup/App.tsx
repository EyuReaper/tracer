import { useCallback, useEffect, useState } from "react";
import type { ConfidenceResult, DateSignal, Settings } from "../../src/types";
import {
  DEFAULT_SETTINGS,
  SIGNAL_LABELS,
  SIGNAL_WEIGHTS,
} from "../../src/types";
import { getSettings, setSettings } from "../../src/utils/settings";
import { formatAge, formatDate } from "../../src/utils/age";

const LEVEL_STYLES: Record<string, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-red-500",
};

const LEVEL_TEXT: Record<string, string> = {
  high: "High Confidence",
  medium: "Medium Confidence",
  low: "Low Confidence",
};

function SignalRow({ signal }: { signal: DateSignal }) {
  const label = SIGNAL_LABELS[signal.source] ?? signal.source;
  const weight = SIGNAL_WEIGHTS[signal.source] ?? 0;
  const has = signal.date !== null;
  const skipped = signal.status === "skipped";

  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${has ? "bg-emerald-400" : "bg-zinc-600"}`}
        />
        <span className={skipped ? "text-zinc-500" : "text-zinc-300"}>
          {label}
        </span>
        <span className="text-zinc-600 text-xs">
          {Math.round(weight * 100)}%
        </span>
      </div>
      <span className="text-zinc-400 text-xs font-mono">
        {has ? formatDate(signal.date) : skipped ? "Off" : "—"}
      </span>
    </div>
  );
}

function NetworkToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-zinc-800 cursor-pointer">
      <span>
        <span className="block text-xs text-zinc-400">Network lookups</span>
        <span className="block text-[10px] text-zinc-600">
          Query Wayback Machine and sitemap.xml
        </span>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative w-9 h-5 shrink-0 rounded-full bg-zinc-700 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-emerald-500 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400"
      />
    </label>
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
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        setError("No active tab found");
        setLoading(false);
        return;
      }
      if (!tab.url?.startsWith("http")) {
        setLoading(false);
        console.log("serverless page");
        return;
      } else if (tab.url) {
        setUrl(tab.url);
        console.log(tab.url);
      }

      const response = await browser.runtime.sendMessage({
        type: "GET_RESULT",
        payload: { url: tab.url, tabId: tab.id },
      });
      if (response) {
        setResult(response);
      } else {
        setError("No data available for this page");
      }
      setLoading(false);
    } catch {
      setError("Extension error");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getSettings().then(setSettingsState);
    scan();
  }, [scan]);

  // Persist first, then re-scan so the background recomputes under the new
  // setting instead of serving the cache entry stamped with the old one.
  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setSettingsState((prev) => ({ ...prev, networkLookups: enabled }));
      await setSettings({ networkLookups: enabled });
      await scan();
    },
    [scan],
  );

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

  if (url?.startsWith("chrome://")) {
    return (
      <div className="w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]">
        <div className="text-violet-500 text-sm">
          Built-in internal page Detected
        </div>
      </div>
    );
  } else if (url?.startsWith("file://")) {
    return (
      <div className="w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]">
        <div className="text-zinc-500 text-sm">file storage link detected</div>
      </div>
    );
  } else if (url?.startsWith("about:")) {
    return (
      <div className="w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]">
        <div className="text-zinc-500 text-sm">about:blank page detected</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="w-[360px] p-6 bg-zinc-950 text-white min-h-[200px]">
        <div className="text-zinc-500 text-sm">No data available</div>
        <NetworkToggle
          enabled={settings.networkLookups}
          onChange={handleToggle}
        />
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

      <NetworkToggle
        enabled={settings.networkLookups}
        onChange={handleToggle}
      />
    </div>
  );
}
