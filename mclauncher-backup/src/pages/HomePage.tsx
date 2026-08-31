import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Cpu, Loader2, Square, Package, Timer } from 'lucide-react';
import { useAppStore } from '../store';
import { toast } from '../components/Toast';
import { MiniConsole } from '../components/MiniConsole';

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function HomePage() {
  const active_profile = useAppStore((s) => s.active_profile);
  const ram = useAppStore((s) => s.ram);
  const gameRunning = useAppStore((s) => s.gameRunning);
  const launching = useAppStore((s) => s.launching);
  const gameStartedAt = useAppStore((s) => s.gameStartedAt);
  const init = useAppStore((s) => s.init);
  const launchGame = useAppStore((s) => s.launchGame);
  const cancelLaunch = useAppStore((s) => s.cancelLaunch);
  const closeGame = useAppStore((s) => s.closeGame);
  const [elapsed, setElapsed] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    init();
  }, []);

  // Консоль: раскрывается при запуске/работе игры, сама скрывается, когда игра закрылась
  useEffect(() => {
    if (gameRunning || launching) setConsoleOpen(true);
    else setConsoleOpen(false);
  }, [gameRunning, launching]);

  useEffect(() => {
    if (!gameRunning || !gameStartedAt) {
      setElapsed(0);
      return;
    }
    setElapsed(Date.now() - gameStartedAt);
    const t = setInterval(() => setElapsed(Date.now() - gameStartedAt), 1000);
    return () => clearInterval(t);
  }, [gameRunning, gameStartedAt]);

  const handleLaunch = async () => {
    try {
      await launchGame();
      toast('Minecraft запускается...');
    } catch (e) {
      toast(String(e), 'error');
    }
  };

  const handleCancelLaunch = async () => {
    try {
      await cancelLaunch();
      toast('Запуск отменён');
    } catch (e) {
      toast(String(e), 'error');
    }
  };

  const handleClose = async () => {
    try {
      await closeGame();
      toast('Отправлен запрос на закрытие Minecraft');
    } catch (e) {
      toast(String(e), 'error');
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto w-full flex flex-col min-h-full relative transition-[max-width] duration-300 ease-out">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mb-10 text-center relative"
      >
        <h1 className="text-5xl font-semibold leading-tight tracking-wide mb-3"
            style={{ fontFamily: "'PauzaStencil', 'Onest', sans-serif" }}>
          {[...'MC'].map((c, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.4, ease: 'easeOut' }}
            >
              {c}
            </motion.span>
          ))}
          {[...'Launcher'].map((c, i) => (
            <motion.span
              key={`a${i}`}
              initial={{ opacity: 0, y: 10, filter: 'blur(8px)', color: '#ffffff', textShadow: '0 0 0px rgba(255,123,29,0)' }}
              animate={{
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                color: '#ff7b1d',
                textShadow: '0 0 24px rgba(255,123,29,0.55)',
              }}
              transition={{
                opacity: { delay: 0.27 + i * 0.06, duration: 0.4, ease: 'easeOut' },
                y: { delay: 0.27 + i * 0.06, duration: 0.4, ease: 'easeOut' },
                filter: { delay: 0.27 + i * 0.06, duration: 0.4, ease: 'easeOut' },
                color: { delay: 0.55 + i * 0.06, duration: 0.5, ease: 'easeInOut' },
                textShadow: { delay: 0.55 + i * 0.06, duration: 0.5, ease: 'easeInOut' },
              }}
            >
              {c}
            </motion.span>
          ))}
        </h1>

        <p className="text-base text-text-secondary leading-relaxed mb-6 max-w-[540px] mx-auto">
          Ваш мир уже совсем близко — остался один клик.
        </p>

        {/* Строка с активным профилем */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-transparent border border-white/15 text-xs text-text-secondary">
            <Package className="w-3.5 h-3.5 text-accent" />
            {active_profile || 'Профиль не выбран'}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-transparent border border-white/15 text-xs text-text-secondary">
            <Cpu className="w-3.5 h-3.5 text-accent" />
            {ram} GB
          </span>
        </div>
      </motion.div>

      {/* Launch Button — главный элемент, по центру */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className="flex flex-col items-center gap-3 mb-10"
      >
<motion.button
          layout
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleLaunch}
          disabled={!active_profile || gameRunning || launching}
          className="flex items-center gap-3 px-10 py-3.5 rounded-pill bg-bg-2/60 backdrop-blur-sm border-2 border-accent text-accent
            font-semibold text-base transition-colors duration-200 hover:bg-accent/10 hover:border-accent
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bg-2/60 disabled:hover:border-accent"
        >
          {launching ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Minecraft запускается...
            </>
          ) : gameRunning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Minecraft запущен
            </>
          ) : (
            <>
              <Rocket className="w-6 h-6" />
              Запустить Minecraft
            </>
          )}
        </motion.button>

        <AnimatePresence>
          {(launching || gameRunning) && (
            <motion.button
              key="danger"
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={launching ? handleCancelLaunch : handleClose}
              className="flex items-center gap-2 px-8 py-3 rounded-pill bg-bg-2/60 backdrop-blur-sm border-2 border-danger/50 text-danger
                font-semibold text-sm transition-colors duration-200 hover:bg-danger/10 hover:border-danger"
            >
              <Square className="w-4 h-4 shrink-0" fill="currentColor" />
              <span className="whitespace-nowrap">
                {launching ? 'Отменить запуск' : 'Закрыть Minecraft'}
              </span>
            </motion.button>
          )}
          {gameRunning && (
            <motion.div
              key="timer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="flex items-center gap-2 text-sm text-text-secondary"
            >
              <Timer className="w-4 h-4 text-accent" />
              Время в игре: <span className="text-white/90 font-medium tabular-nums">{formatTime(elapsed)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Мини-консоль — внизу главной */}
      <div className="mt-auto pt-6">
        <MiniConsole open={consoleOpen} onToggle={() => setConsoleOpen(!consoleOpen)} />
      </div>

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.8 }}
        className="pb-2 text-center"
      >
        <p className="text-[11px] text-white/15 select-none">
          Неофициальный лаунчер. Не связан с Mojang и Microsoft.
        </p>
      </motion.div>
    </div>
  );
}