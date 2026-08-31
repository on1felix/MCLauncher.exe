import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useAppStore } from '../store';
import { logColor } from '../lib/logColors';

interface MiniConsoleProps {
  open: boolean;
  onToggle: () => void;
}

export function MiniConsole({ open, onToggle }: MiniConsoleProps) {
  const { logs, gameRunning, launching, clearLogs } = useAppStore();
  const logRef = useRef<HTMLDivElement>(null);
  // Слежение за низом: активно, пока пользователь у нижнего края
  const stickRef = useRef(true);
  const prevLenRef = useRef(0);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  // При открытии — принудительно к низу
  useEffect(() => {
    if (open && logRef.current) {
      stickRef.current = true;
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [open]);

  useEffect(() => {
    // Логи очистили — возвращаем слежение
    if (logs.length < prevLenRef.current) stickRef.current = true;
    prevLenRef.current = logs.length;
    if (open && stickRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, open]);

  const status = launching
    ? { text: 'Запуск...', dot: 'bg-accent animate-pulse-dot', color: 'text-accent' }
    : gameRunning
      ? { text: 'Запущен', dot: 'bg-accent', color: 'text-accent' }
      : { text: 'Не запущен', dot: 'bg-text-muted', color: 'text-text-muted' };

  return (
    <div className="bg-bg/50 rounded-lg border border-border overflow-hidden mb-4 gradient-border">
      {/* Шапка — клик раскрывает/скрывает */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-bg-2/40 transition-colors"
      >
        <Terminal className="w-4 h-4 text-accent shrink-0" />
        <span className="text-sm font-medium">Консоль</span>
        <span className={`flex items-center gap-1.5 text-xs ml-1 ${status.color}`}>
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
          {status.text}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              clearLogs();
            }}
            className="p-1.5 rounded-lg text-text-secondary hover:text-white/90 hover:bg-white/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </span>
          <span className="p-1 rounded-lg text-text-secondary">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {/* Тело */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div
              ref={logRef}
              onScroll={handleScroll}
              className="h-44 overflow-y-auto overflow-x-hidden border-t border-border bg-[#0a0a0c]/60 backdrop-blur-lg px-4 py-3"
            >
              <div className="font-mono text-xs leading-relaxed">
                {logs.length === 0 ? (
                  <div className="text-text-muted animate-pulse">
                    Ожидание запуска Minecraft... Логи появятся здесь автоматически.
                  </div>
                ) : (
                  logs.map((l) => (
                    <div key={l.id} className="flex gap-2 py-px">
                      <span className="text-text-muted shrink-0">[{l.time}]</span>
                      {l.kind === 'game' && (
                        <span className="text-text-muted shrink-0">[MC]</span>
                      )}
                      <span className={logColor(l.kind, l.text)}>{l.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}