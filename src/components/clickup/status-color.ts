// Map a semantic status color token → the theme CSS variable (both light/dark aware).
const STATUS_VAR: Record<string, string> = {
  ok: "--ok",
  warn: "--warn",
  bad: "--bad",
  info: "--qinfo",
  brand: "--brand",
  neutral: "--ink4",
};

export function statusColor(token: string): string {
  return `var(${STATUS_VAR[token] ?? "--ink4"})`;
}
