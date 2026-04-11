export function formatTabLabel(title: string, note?: string): string {
  return note ? `${title} · ${note}` : title;
}
