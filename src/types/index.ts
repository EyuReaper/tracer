export interface PageMetadata {
  url: string;
  title: string;
  signals: DateSignal[];
}

export interface DateSignal {
  source: SignalSource;
  date: string | null;
  raw: string | null;
  reliability: number;
}

export type SignalSource =
  | 'meta_tags'
  | 'http_last_modified'
  | 'schema_org'
  | 'wayback_machine'
  | 'sitemap_lastmod';

export const SIGNAL_WEIGHTS: Record<SignalSource, number> = {
  wayback_machine: 0.35,
  schema_org: 0.25,
  meta_tags: 0.2,
  sitemap_lastmod: 0.1,
  http_last_modified: 0.1,
};

export const SIGNAL_LABELS: Record<SignalSource, string> = {
  wayback_machine: 'Wayback Machine',
  schema_org: 'Schema.org JSON-LD',
  meta_tags: 'Meta Tags (Open Graph)',
  sitemap_lastmod: 'Sitemap lastmod',
  http_last_modified: 'HTTP Last-Modified',
};

export interface ConfidenceResult {
  score: number;
  level: 'high' | 'medium' | 'low';
  earliestDate: string | null;
  latestDate: string | null;
  signals: DateSignal[];
}

export interface BackgroundMessage {
  type: 'PAGE_METADATA';
  payload: PageMetadata;
}

export interface BackgroundResponse {
  type: 'CONFIDENCE_RESULT';
  payload: ConfidenceResult;
}
