import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Cpu, User, Gamepad2 } from 'lucide-react';
import { useAppStore } from '../store';
import { toast } from '../components/Toast';

export function LaunchPage() {
  const {
    nickname, ram, setRam, discord_rpc, setDiscordRpc,
  } = useAppStore();
  const [editingNick, setEditingNick] = useState(false);
  const [nickValue, setNickValue] = useState(nickname);
  const { setNickname } = useAppStore();

  const [draftRam, setDraftRam] = useState(ram);
  const [ramInput, setRamInput] = useState(String(ram));
  const ramEnterApplied = useRef(false);

  // Синхронизация при изменении ram извне (смена профиля)
  useEffect(() => {
    setDraftRam(ram);
    setRamInput(String(ram));
  }, [ram]);

  const applyRam = async (gb: number) => {
    const v = Math.min(64, Math.max(1, Math.round(gb) || 1));
    if (v === ram) {
      setDraftRam(v);
      setRamInput(String(v));
      return;
    }
    await setRam(v);
    setDraftRam(v);
    setRamInput(String(v));
    toast(`Выделенная память: ${v} GB`);
  };

  const handleNickSave = async () => {
    if (nickValue.trim() && nickValue !== nickname) {
      await setNickname(nickValue.trim());
      toast(`Никнейм сохранён: ${nickValue.trim()}`);
    }
    setEditingNick(false);
  };

  const toggleDiscord = async () => {
    const next = !(discord_rpc ?? true);
    setDiscordRpc(next);
    toast(next ? 'Discord статус включён' : 'Discord статус выключен');
  };

  return (
    <div className="max-w-[1600px] mx-auto w-full transition-[max-width] duration-300 ease-out">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Настройка запуска</h2>
        </div>

        {/* Nickname */}
        <div className="bg-bg/50 rounded-lg border border-border p-5 mb-4 gradient-border">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Никнейм</span>
          </div>
          {editingNick ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={nickValue}
                onChange={(e) => setNickValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNickSave()}
                autoFocus
                className="flex-1 px-4 py-2.5 rounded-lg bg-card border border-border text-white/90 text-sm
                  focus:outline-none focus:border-accent transition-colors"
              />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNickSave}
                className="px-4 py-2 rounded-lg bg-bg/70 border-2 border-accent text-accent text-sm font-medium
                  hover:bg-accent/10 transition-colors"
              >
                Сохранить
              </motion.button>
            </div>
          ) : (
            <button
              onClick={() => { setNickValue(nickname); setEditingNick(true); }}
              className="text-left px-4 py-2.5 rounded-lg bg-bg/50 border border-border text-white/90 text-sm
                hover:border-accent transition-colors w-full"
            >
              {nickname}
            </button>
          )}
          <p className="text-xs text-text-muted mt-2">
            По этому нику отображается голова вашего скина в сайдбаре (официальный Mojang API).
          </p>
        </div>

        {/* RAM Selection */}
        <div className="bg-bg/50 rounded-lg border border-border p-5 mb-4 gradient-border">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Выделенная память</span>
            <span className="text-xs text-text-muted ml-auto">{ram} GB выбрано</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-text-muted">2 GB</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={ramInput}
                    onChange={(e) => setRamInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        ramEnterApplied.current = true;
                        applyRam(parseInt(ramInput));
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={() => {
                      if (ramEnterApplied.current) {
                        ramEnterApplied.current = false;
                        return;
                      }
                      applyRam(parseInt(ramInput));
                    }}
                    min={1}
                    max={64}
                    className="w-16 px-1 py-1 rounded-lg bg-bg/50 border border-border
                      text-2xl font-bold text-accent tabular-nums text-center
                      focus:outline-none focus:border-accent transition-colors [appearance:textfield]
                      [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-sm text-text-secondary">GB</span>
                </div>
                <span className="text-xs text-text-muted">16 GB</span>
              </div>
              <input
                type="range"
                min={2}
                max={16}
                step="any"
                value={draftRam}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setDraftRam(v);
                  setRamInput(String(Math.round(v)));
                }}
                onPointerUp={() => applyRam(Math.round(draftRam))}
                onKeyUp={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
                    applyRam(Math.round(draftRam));
                  }
                }}
                className="w-full h-2 appearance-none cursor-grab active:cursor-grabbing rounded-full
                  transition-[background-size] duration-150 ease-out
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,123,29,0.7)]"
                style={{
                  background: `linear-gradient(to right, #ff7b1d ${((draftRam - 2) / 14) * 100}%, rgba(255,255,255,0.08) ${((draftRam - 2) / 14) * 100}%)`,
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                }}
              />
            </div>
          </div>
        </div>

        {/* Discord Rich Presence */}
        <div className="bg-bg/50 rounded-lg border border-border p-5 mb-4 gradient-border">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Gamepad2 className="w-4 h-4 text-accent shrink-0" />
              <span className="text-sm font-medium">Статус в Discord</span>
            </div>
            <button
              onClick={toggleDiscord}
              className={`relative w-[46px] h-[22px] rounded-md border overflow-hidden cursor-pointer shrink-0
                transition-colors duration-300 ${
                  discord_rpc ? 'bg-white/[0.05] border-accent/50' : 'bg-white/[0.03] border-border'
                }`}
            >
              <motion.span
                animate={{ x: discord_rpc ? 23 : 3 }}
                transition={{ type: 'spring', stiffness: 430, damping: 24 }}
                className={`absolute top-[2px] left-0 w-[18px] h-[16px] rounded-[4px]
                  border flex items-center justify-center text-[7px] font-bold leading-none tracking-wide
                  transition-[background-color,color,border-color] duration-300 ${
                    discord_rpc
                      ? 'bg-accent text-white border-accent/90'
                      : 'bg-white/[0.05] text-text-secondary border-white/[0.20]'
                  }`}
              >
                {discord_rpc ? 'ON' : 'OFF'}
              </motion.span>
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Показывает в Discord «играет в Minecraft» и текущий сервер.
          </p>
        </div>
      </motion.div>
    </div>
  );
}