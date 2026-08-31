import { motion } from 'framer-motion';
import { Download, CheckCircle2 } from 'lucide-react';
import type { UpdateInfo, UpdateProgress } from '../api';

interface UpdateModalProps {
  info: UpdateInfo;
  progress: UpdateProgress | null;
  restarting: boolean;
  error?: string | null;
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

export function UpdateModal({ info, progress, restarting, error }: UpdateModalProps) {
  const percent = progress ? Math.min(progress.percent, 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-[420px] rounded-2xl bg-[#16161a]/90 border border-border/80 p-7 shadow-2xl shadow-black/70 gradient-border"
      >
        {/* Иконка + заголовок */}
        <div className="flex items-center gap-3.5 mb-5">
          <motion.div
            animate={{ scale: [1, 1.07, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/40 flex items-center justify-center flex-shrink-0
              shadow-[0_0_18px_rgba(255,123,29,0.3)]"
          >
            {restarting ? (
              <CheckCircle2 className="w-6 h-6 text-accent" />
            ) : (
              <Download className="w-6 h-6 text-accent" />
            )}
          </motion.div>
          <div>
            <div className="text-lg font-semibold text-white/90">
              {restarting ? 'Обновление установлено' : 'Доступно обновление'}
            </div>
            {restarting ? (
              <div className="text-xs text-text-secondary mt-0.5">Перезапуск лаунчера...</div>
            ) : (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-text-secondary tabular-nums">
                  {info.current.replace(/\.0$/, '')}
                </span>
                <span className="relative inline-flex items-center h-5 w-14">
                  <svg
                    className="h-5 w-14"
                    viewBox="0 0 56 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <filter id="arrowGlow" x="-50%" y="-200%" width="200%" height="500%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
                      </filter>
                    </defs>
                    {/* Свечение — сегмент бежит по контуру стрелки */}
                    <g filter="url(#arrowGlow)">
                      <path
                        d="M2 10 L36 10 M30 4.5 L39 10 L30 15.5"
                        stroke="#ff7b1d"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="arrow-glow-path"
                      />
                    </g>
                    {/* Основная стрелка — тонкая иконка */}
                    <g
                      stroke="#ff7b1d"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.5"
                    >
                      <line x1="2" y1="10" x2="36" y2="10" />
                      <polyline points="30,5 39,10 30,15" />
                    </g>
                  </svg>
                </span>
                <span className="text-xs text-white/90 font-semibold tabular-nums">{info.latest}</span>
              </div>
            )}
          </div>
        </div>

        {/* Прогресс-бар */}
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent
              shadow-[0_0_12px_rgba(255,123,29,0.55)] transition-[width] duration-300 ease-out"
            style={{ width: `${restarting ? 100 : percent}%` }}
          />
        </div>

        {/* Проценты и скорость */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm font-semibold text-white/90 tabular-nums">
            {percent.toFixed(1)}%
          </span>
          {!restarting && progress && (
            <span className="text-xs text-accent font-medium tabular-nums">
              {progress.speed_mbps.toFixed(1)} МБ/с
            </span>
          )}
        </div>

        {/* Скачано / всего */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-text-muted">
            {progress
              ? `${mb(progress.downloaded)} МБ из ${mb(info.size || progress.total)} МБ`
              : 'Подготовка...'}
          </span>
          <span className="text-[11px] text-text-muted">MCLauncher</span>
        </div>

        {error && (
          <div className="mt-4 text-xs text-danger leading-relaxed bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
