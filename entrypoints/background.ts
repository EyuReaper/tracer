import type {
  BackgroundMessage,
  ConfidenceResult,
  DateSignal,
  PageMetadata,
} from '../src/types';
import { computeConfidence } from '../src/utils/confidence';
const cache = new Map<string, ConfidenceResult>();

async function fetchWaybackFirstSeen(
  url: string,
): Promise<DateSignal> {
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const res = await fetch(api);
    const data = await res.json();
    const snapshot = data?.archived_snapshots?.closest;
    if (snapshot?.timestamp) {
      const ts = snapshot.timestamp;
      const dateStr = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
      return {
        source: 'wayback_machine',
        date: dateStr,
        raw: snapshot.timestamp,
        reliability: 1,
      };
    }
  } catch {
    // Wayback API unavailable
  }
  return { source: 'wayback_machine', date: null, raw: null, reliability: 0 };
}

async function fetchSitemapLastmod(
  url: string,
): Promise<DateSignal> {
  try {
    const origin = new URL(url).origin;
    const sitemapUrl = `${origin}/sitemap.xml`;
    const res = await fetch(sitemapUrl);
    if (!res.ok) return { source: 'sitemap_lastmod', date: null, raw: null, reliability: 0 };
    const text = await res.text();
    const match = text.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (match?.[1] && !isNaN(Date.parse(match[1]))) {
      return {
        source: 'sitemap_lastmod',
        date: new Date(match[1]).toISOString(),
        raw: match[1],
        reliability: 1,
      };
    }
  } catch {
    // Sitemap unavailable
  }
  return { source: 'sitemap_lastmod', date: null, raw: null, reliability: 0 };
}

async function processMetadata(
  metadata: PageMetadata,
): Promise<ConfidenceResult> {
  if (cache.has(metadata.url)) {
    return cache.get(metadata.url)!;
  }

  const [waybackSignal, sitemapSignal] = await Promise.all([
    fetchWaybackFirstSeen(metadata.url),
    fetchSitemapLastmod(metadata.url),
  ]);

  metadata.signals.push(waybackSignal, sitemapSignal);

  const result = computeConfidence(metadata);
  cache.set(metadata.url, result);
  return result;
}

export default defineBackground(() => {
  const tabUrlMap = new Map<number, string>();

  browser.runtime.onMessage.addListener(
    (
      message: BackgroundMessage,
      _sender,
      sendResponse: (response: ConfidenceResult) => void,
    ) => {
      if (message.type === 'PAGE_METADATA') {
        // track tab=>url mapping
        if (_sender.tab?.id != null && !tabUrlMap.has(_sender.tab.id)) {
          tabUrlMap.set(_sender.tab.id, message.payload.url);
        }

        processMetadata(message.payload).then((result) => {
          sendResponse(result);
        });
        return true;
      }
    },
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    const url = tabUrlMap.get(tabId);
    if (url) {
      cache.delete(url);
      tabUrlMap.delete(tabId);
    }
  });
});
