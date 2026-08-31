import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listen, emit } from '@tauri-apps/api/event';
import { AlertTriangle, ArrowUp } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { HomePage } from './pages/HomePage';
import { LaunchPage } from './pages/LaunchPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { PastePage } from './pages/PastePage';
import { ModsPage } from './pages/ModsPage';
import { HelpPage } from './pages/HelpPage';
import { TitleBar } from './components/TitleBar';
import { Toast } from './components/Toast';
import { UpdateModal } from './components/UpdateModal';
import { api, type UpdateInfo, type UpdateProgress } from './api';

export type Screen = 'home' | 'launch' | 'profiles' | 'mods' | 'paste' | 'help';

const pages: Record<Screen, React.ComponentType> = {
  home: HomePage,
  launch: LaunchPage,
  profiles: ProfilesPage,
  mods: ModsPage,
  paste: PastePage,
  help: HelpPage,
};

export default function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>('home');
  const [confirmClose, setConfirmClose] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Кнопка «наверх» на странице модов (все вкладки)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [showTopBtn, setShowTopBtn] = useState(false);
  useEffect(() => {
    if (activeScreen !== 'mods' || !scrollEl) {
      setShowTopBtn(false);
      return;
    }
    const onScroll = () => setShowTopBtn(scrollEl.scrollTop > 240);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [activeScreen, scrollEl]);

  // Автообновление: проверка при старте + прогресс скачивания
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    listen<UpdateProgress>('update-progress', (e) => setUpdateProgress(e.payload)).then((f) => {
      unlistenProgress = f;
    });

    const timer = setTimeout(async () => {
      try {
        const info = await api.checkUpdate();
        if (info) {
          setUpdateInfo(info);
          await api.downloadUpdate(info.download_url);
        }
      } catch (e) {
        setUpdateError(String(e));
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      unlistenProgress?.();
    };
  }, []);

  // Скачивание завершено — заменяем файл и перезапускаемся
  const applyingRef = useRef(false);
  useEffect(() => {
    if (updateProgress && updateProgress.percent >= 100 && !applyingRef.current) {
      applyingRef.current = true;
      setRestarting(true);
      setTimeout(() => {
        api.applyUpdate().catch((e) => setUpdateError(String(e)));
      }, 900);
    }
  }, [updateProgress]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('close-requested', () => setConfirmClose(true)).then((f) => {
      unlisten = f;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    // Приложение прогрузилось — показываем окно
    emit('app-ready');
  }, []);

  // Отключаем системное контекстное меню (ПКМ)
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // Tab не должен двигать фокус и рисовать обводки
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') e.preventDefault();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const handleExit = () => {
    api.quitApp();
  };

  const PageComponent = pages[activeScreen];

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* Background */}
      <div className="bg-layer" />

      {/* App Content */}
      <div className="relative z-10 flex flex-col h-full">
        <TitleBar />
        
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeScreen={activeScreen} onNavigate={setActiveScreen} />
          
          <main className="flex-1 overflow-hidden flex flex-col relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeScreen}
                ref={setScrollEl}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex-1 overflow-y-auto p-8"
              >
                <PageComponent />
              </motion.div>
            </AnimatePresence>

            {/* Кнопка «наверх» — появляется при прокрутке вниз */}
            <AnimatePresence>
              {showTopBtn && (
                <motion.button
                  key="scroll-top"
                  initial={{ opacity: 0, y: -14, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -14, scale: 0.8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => scrollEl?.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="absolute top-4 inset-x-0 mx-auto w-10 h-10 rounded-full bg-text-secondary/10 backdrop-blur-sm border-2 border-accent/40 text-accent/80
                    flex items-center justify-center transition-[background-color,border-color,color,box-shadow] duration-200
                    hover:bg-accent/10 hover:border-accent hover:text-accent hover:shadow-[0_0_18px_rgba(255,123,29,0.4)]"
                >
                  <ArrowUp className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Кастомное подтверждение закрытия */}
      <AnimatePresence>
        {confirmClose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-[400px] rounded-2xl bg-[#16161a]/85 border border-border/80 p-6 shadow-2xl shadow-black/70 gradient-border"
            >
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-11 h-11 rounded-lg bg-danger/15 border border-danger/40 flex items-center justify-center flex-shrink-0 shadow-[0_0_16px_rgba(255,80,80,0.25)]"
                >
                  <AlertTriangle className="w-5 h-5 text-danger" />
                </motion.div>
                <div>
                  <div className="text-base font-semibold">Minecraft ещё запущена</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    При выходе игра будет закрыта
                  </div>
                </div>
              </div>
              <div className="text-sm text-text-secondary leading-relaxed mb-6">
                Вы уверены, что хотите выйти? Лаунчер закроется вместе с игрой.
              </div>
              <div className="flex gap-2 justify-end">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setConfirmClose(false)}
                  className="w-[108px] justify-center px-5 py-2.5 rounded-lg bg-bg/60 border-2 border-success/40 text-success/90 text-sm font-medium
                    transition-[color,border-color,box-shadow] duration-200 hover:border-success hover:text-success hover:shadow-[0_0_10px_rgba(52,199,89,0.35)]"
                >
                  Отмена
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleExit}
                  className="w-[108px] justify-center px-5 py-2.5 rounded-lg bg-bg/60 border-2 border-danger/40 text-danger/90 text-sm font-semibold
                    transition-[color,border-color,box-shadow] duration-200 hover:border-danger hover:text-danger hover:shadow-[0_0_10px_rgba(255,59,48,0.35)]"
                >
                  Выйти
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Окно автообновления */}
      <AnimatePresence>
        {updateInfo && (
          <UpdateModal
            info={updateInfo}
            progress={updateProgress}
            restarting={restarting}
            error={updateError}
          />
        )}
      </AnimatePresence>

      <Toast />
    </div>
  );
}