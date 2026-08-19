import type {
  BackgroundMessage,
  CachedResult,
  ConfidenceResult,
  DateSignal,
  PageMetadata,
  SignalSource,
} from "../src/types";
import { computeConfidence } from "../src/utils/confidence";
import { getSettings } from "../src/utils/settings";
const STORAGE_KEY = "tracer_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24hr
const FRESH_TTL_MS = 60 * 60 * 1000; // 1hr

// Serializes cache writes. The whole cache lives in one storage key, so an
// unguarded read-modify-write lets two tabs finishing at the same time clobber
// each other. Only one service worker instance exists at a time, so chaining
// onto a module-level promise is enough of a mutex.
let cacheLock: Promise<unknown> = Promise.resolve();

function withCacheLock<T>(task: () => Promise<T>): Promise<T> {
  const run = cacheLock.then(task, task);
  cacheLock = run.catch(() => {});
  return run;
}

async function readCache(): Promise<Map<string, CachedResult>> {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return new Map(Object.entries(data[STORAGE_KEY] ?? {}));
}

/**
 * Stores one entry, evicting anything past the 24h TTL along the way.
 *
 * The re-read inside the lock is the point: `processMetadata` reads the cache
 * *before* its network fetches, so by the time it is ready to write, the copy it
 * holds can be seconds stale and missing entries another tab wrote meanwhile.
 * Writing only the one key we own preserves those.
 */
async function writeCacheEntry(
  url: string,
  entry: CachedResult,
): Promise<void> {
  await withCacheLock(async () => {
    const cache = await readCache();
    cache.set(url, entry);

    const now = Date.now();
    for (const [key, cached] of cache) {
      if (now - cached.timestamp > CACHE_TTL_MS) {
        cache.delete(key);
      }
    }

    await browser.storage.local.set({
      [STORAGE_KEY]: Object.fromEntries(cache),
    });
  });
}

function skippedSignal(source: SignalSource): DateSignal {
  return { source, date: null, raw: null, reliability: 0, status: "skipped" };
}

async function fetchWaybackFirstSeen(url: string): Promise<DateSignal> {
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const res = await fetch(api);
    const data = await res.json();
    const snapshot = data?.archived_snapshots?.closest;
    if (snapshot?.timestamp) {
      const ts = snapshot.timestamp;
      const dateStr = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
      return {
        source: "wayback_machine",
        date: dateStr,
        raw: snapshot.timestamp,
        reliability: 1,
        status: "found",
      };
    }
  } catch {
    // Wayback API unavailable
  }
  return {
    source: "wayback_machine",
    date: null,
    raw: null,
    reliability: 0,
    status: "not_found",
  };
}

async function fetchSitemapLastmod(url: string): Promise<DateSignal> {
  try {
    const origin = new URL(url).origin;
    const sitemapUrl = `${origin}/sitemap.xml`;
    const res = await fetch(sitemapUrl);
    if (!res.ok)
      return {
        source: "sitemap_lastmod",
        date: null,
        raw: null,
        reliability: 0,
        status: "not_found",
      };
    const text = await res.text();
    const match = text.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (match?.[1] && !isNaN(Date.parse(match[1]))) {
      return {
        source: "sitemap_lastmod",
        date: new Date(match[1]).toISOString(),
        raw: match[1],
        reliability: 1,
        status: "found",
      };
    }
  } catch {
    // Sitemap unavailable
  }
  return {
    source: "sitemap_lastmod",
    date: null,
    raw: null,
    reliability: 0,
    status: "not_found",
  };
}

async function processMetadata(
  metadata: PageMetadata,
): Promise<ConfidenceResult> {
  const settings = await getSettings();
  const cache = await readCache();
  const entry = cache.get(metadata.url);

  // Cache-hit shortcut: if < 1hr old, skip fetch. The setting must match too —
  // a result computed with network lookups on still carries Wayback/sitemap
  // dates, so serving it after the user turns them off would ignore the toggle.
  if (
    entry &&
    entry.networkLookups === settings.networkLookups &&
    Date.now() - entry.timestamp < FRESH_TTL_MS
  ) {
    return entry.result;
  }

  // fresh fetch from external APIs, unless the user opted out of network lookups
  const [waybackSignal, sitemapSignal] = settings.networkLookups
    ? await Promise.all([
        fetchWaybackFirstSeen(metadata.url),
        fetchSitemapLastmod(metadata.url),
      ])
    : [skippedSignal("wayback_machine"), skippedSignal("sitemap_lastmod")];

  const result = computeConfidence({
    ...metadata,
    signals: [...metadata.signals, waybackSignal, sitemapSignal],
  });

  // Persist to storage
  await writeCacheEntry(metadata.url, {
    result,
    timestamp: Date.now(),
    networkLookups: settings.networkLookups,
  });

  return result;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (
      message: BackgroundMessage,
      _sender,
      sendResponse: (response?: ConfidenceResult) => void,
    ) => {
      if (message.type === "PAGE_METADATA") {
        processMetadata(message.payload).then((result) => {
          sendResponse(result);
        });
        return true;
      }
      if (message.type === "GET_RESULT") {
        browser.tabs
          .sendMessage(message.payload.tabId, { type: "GET_METADATA" })
          .then((metadata) => processMetadata(metadata))
          .then((result) => sendResponse(result))
          .catch(() => sendResponse(undefined));

        return true;
      }
    },
  );
  // listen to SPA navigation
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    //if url changes, send message to content script in that tab
    if (changeInfo.url) {
      browser.tabs.sendMessage(tabId, { type: "URL_CHANGED" }).catch(() => {});
    }
  });
});
