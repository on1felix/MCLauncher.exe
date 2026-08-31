import type { LogEntry } from '../store';

// Подсветка строк лога как в консольной версии:
// ошибки — красным, предупреждения — золотым, INFO — зелёным, остальное — белым
export function logColor(kind: LogEntry['kind'], text: string) {
  if (kind === 'err') return 'text-danger';
  if (kind === 'info') return 'text-[#55ff55]';
  const low = text.toLowerCase();
  if (/(error|exception|failed|fatal|crash|stacktrace)/.test(low)) return 'text-danger';
  if (/(warn|warning)/.test(low)) return 'text-[#ffdc50]';
  if (low.includes('info')) return 'text-[#55ff55]';
  return 'text-white/90';
}