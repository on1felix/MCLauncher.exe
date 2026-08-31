import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clipboard, Save, Zap, ChevronDown, Loader2 } from 'lucide-react';
import { useAppStore } from '../store';
import { toast } from '../components/Toast';

export function PastePage() {
  const { pasteConfig, captureConfig } = useAppStore();
  const [name, setName] = useState('');
  const [config, setConfig] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast('Укажите название профиля', 'error');
      return;
    }
    if (!config.trim()) {
      toast('Вставьте строку конфигурации', 'error');
      return;
    }
    try {
      await pasteConfig(name.trim(), config);
      toast(`Профиль «${name.trim()}» сохранён и активирован`);
      setName('');
      setConfig('');
    } catch (e) {
      toast(String(e), 'error');
    }
  };

  const handleCapture = async () => {
    setCapturing(true);
    try {
      await captureConfig();
      toast('Конфиг захвачен и сохранён');
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto w-full transition-[max-width] duration-300 ease-out">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-2xl font-semibold mb-6">Вставить конфиг</h2>

        {/* Автозахват — сворачиваемый виджет */}
        <div className="bg-bg/50 rounded-lg border border-border overflow-hidden mb-5 gradient-border">
          <button
            onClick={() => setCaptureOpen(!captureOpen)}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white/90">Автозахват конфига</div>
              <div className="text-xs text-text-secondary mt-0.5">
                Захватить Command line запущенного Minecraft автоматически
              </div>
            </div>
            <motion.div
              animate={{ rotate: captureOpen ? 180 : 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="text-text-muted"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </button>

          <AnimatePresence initial={false}>
            {captureOpen && (
              <motion.div
                key="capture-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-5">
                  <div className="border-t border-border pt-4">
                    <p className="text-xs text-text-secondary leading-relaxed mb-4">
                      Запустите Minecraft через официальный лаунчер, зайдите в мир,
                      затем нажмите кнопку — строка запуска игры будет захвачена
                      и сохранена как новый профиль.
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCapture}
                      disabled={capturing}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-pill bg-bg/70 border-2 border-accent text-accent
                        text-sm font-medium transition-all duration-200 hover:bg-accent/10
                        disabled:opacity-50 disabled:cursor-wait"
                    >
                      {capturing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Захват...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Захватить конфиг
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Ручная вставка */}
        <div className="bg-bg/50 rounded-lg border border-border p-6 gradient-border">
          <div className="flex items-center gap-2 mb-5">
            <Clipboard className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Ручная вставка</span>
          </div>

          <label className="block text-xs text-text-secondary mb-2">Название профиля</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Мой профиль"
            className="w-full px-4 py-3 rounded-lg bg-bg/50 border border-border text-white/90 text-sm mb-4
              focus:outline-none focus:border-accent transition-colors placeholder:text-text-muted"
          />

          <label className="block text-xs text-text-secondary mb-2">Строка конфигурации (Command line)</label>
          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder="Вставьте сюда строчку Command line из System Informer..."
            rows={8}
            className="w-full px-4 py-3 rounded-lg bg-bg/50 border border-border text-white/90 text-xs font-mono
              focus:outline-none focus:border-accent transition-colors placeholder:text-text-muted
              leading-relaxed resize-none overflow-y-auto overflow-x-hidden"
          />

          <div className="flex justify-center mt-6">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-3 rounded-pill bg-bg/70 border-2 border-accent text-accent
                text-sm font-medium hover:bg-accent/10 hover:border-accent-light transition-all duration-200"
            >
              <Save className="w-4 h-4" />
              Сохранить профиль
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}