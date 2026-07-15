export function formatAge(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffYear > 0) return `${diffYear}y ${diffDay % 365}d ago`;
  if (diffMonth > 0) return `${diffMonth}mo ${diffDay % 30}d ago`;
  if (diffDay > 0) return `${diffDay}d ${diffHr % 24}h ago`;
  if (diffHr > 0) return `${diffHr}h ${diffMin % 60}m ago`;
  if (diffMin > 0) return `${diffMin}m ${diffSec % 60}s ago`;
  return `${diffSec}s ago`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
