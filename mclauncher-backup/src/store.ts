import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { api, LauncherState } from './api';

export interface LogEntry {
  id: number;
  text: string;
  time: string;
  kind: 'info' | 'err' | 'game';
}

let listenersAttached = false;
let logSeq = 0;

// Буферизация логов: при активном потоке логов set() вызывается не на каждую
// строку, а пачками каждые 250 мс — это убирает лаги рендера в консолях.
const logBuffer: LogEntry[] = [];
let logTimer: ReturnType<typeof setInterval> | null = null;
const LOG_LIMIT = 1000;

function scheduleLogFlush() {
  if (logTimer) return;
  logTimer = setInterval(() => {
    if (logBuffer.length === 0) {
      clearInterval(logTimer!);
      logTimer = null;
      return;
    }
    const batch = logBuffer.splice(0, logBuffer.length);
    const st = useAppStore.getState();
    useAppStore.setState({ logs: [...st.logs, ...batch].slice(-LOG_LIMIT) });
  }, 100);
}

// Маркеры, по которым считается, что игра реально запустилась (как в консольной версии)
const START_MARKERS = [
  'setting user:',
  'backend library:',
  'sound engine started',
  'created opengl',
  'openal initialized',
  'title screen',
];

const nowTime = () =>
  new Date().toLocaleTimeString('ru-RU', { hour12: false });

interface AppStore extends LauncherState {
  loading: boolean;
  initialized: boolean;
  gameRunning: boolean;
  launching: boolean;
  gamePid: number | null;
  gameStartedAt: number | null;
  error: string | null;
  logs: LogEntry[];

  init: () => Promise<void>;
  setNickname: (nickname: string) => Promise<void>;
  setRam: (ram: number) => Promise<void>;
  setDiscordRpc: (enabled: boolean) => Promise<void>;
  pasteConfig: (name: string, raw: string) => Promise<void>;
  activateProfile: (name: string) => Promise<void>;
  renameProfile: (oldName: string, newName: string) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
  launchGame: () => Promise<void>;
  cancelLaunch: () => Promise<void>;
  closeGame: () => Promise<void>;
  captureConfig: () => Promise<void>;
  clearLogs: () => void;
  setGameRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  nickname: 'Player',
  raw_config: '',
  active_profile: '',
  profiles: [],
  profile_configs: {},
  ram: 4,
  discord_rpc: true,
  loading: false,
  initialized: false,
  gameRunning: false,
  launching: false,
  gamePid: null,
  gameStartedAt: null,
  error: null,
  logs: [],

  init: async () => {
    if (!listenersAttached) {
      listenersAttached = true;
      listen<string>('game-log', (e) => {
        const st = get();
        const low = e.payload.toLowerCase();

        // Игра считается запущенной, когда в логах появились маркеры запуска окна
        const hasStart = START_MARKERS.some((m) => low.includes(m));
        if (!st.gameRunning && hasStart) {
          set({ gameRunning: true, launching: false, gameStartedAt: Date.now() });
          logBuffer.push({
            id: ++logSeq,
            text: `Minecraft запущен (PID ${st.gamePid ?? '—'})`,
            time: nowTime(),
            kind: 'info',
          });
        }

        logBuffer.push({ id: ++logSeq, text: e.payload, time: nowTime(), kind: 'game' });
        scheduleLogFlush();
      });
      listen('game-exited', () => {
        set({ gameRunning: false, launching: false, gamePid: null, gameStartedAt: null });
        get().logs.push({
          id: ++logSeq,
          text: 'Minecraft закрыт',
          time: nowTime(),
          kind: 'info',
        });
        set({ logs: [...get().logs].slice(-LOG_LIMIT) });
      });
    }
    try {
      set({ loading: true });
      const state = await api.getState();
      set({ ...state, initialized: true, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setNickname: async (nickname) => {
    try {
      const state = await api.setNickname(nickname);
      set({ nickname: state.nickname });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setRam: async (ram) => {
    try {
      const state = await api.setRam(ram);
      set({ ram: state.ram, raw_config: state.raw_config });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setDiscordRpc: async (enabled) => {
    try {
      const state = await api.setDiscord(enabled);
      set({ discord_rpc: state.discord_rpc ?? true });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  pasteConfig: async (name, raw) => {
    try {
      const state = await api.pasteConfig(name, raw);
      set({
        profiles: state.profiles,
        profile_configs: state.profile_configs,
        active_profile: state.active_profile,
        raw_config: state.raw_config,
        ram: state.ram,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  activateProfile: async (name) => {
    try {
      const state = await api.activateProfile(name);
      set({
        active_profile: state.active_profile,
        raw_config: state.raw_config,
        ram: state.ram,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  renameProfile: async (oldName, newName) => {
    try {
      const state = await api.renameProfile(oldName, newName);
      set({
        profiles: state.profiles,
        profile_configs: state.profile_configs,
        active_profile: state.active_profile,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteProfile: async (name) => {
    try {
      const state = await api.deleteProfile(name);
      set({
        profiles: state.profiles,
        profile_configs: state.profile_configs,
        active_profile: state.active_profile,
        raw_config: state.raw_config,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  launchGame: async () => {
    set({ launching: true });
    try {
      const pid = await api.launchGame();
      set({ gamePid: pid });
      get().logs.push({
        id: ++logSeq,
        text: 'Minecraft запускается...',
        time: nowTime(),
        kind: 'info',
      });
      set({ logs: [...get().logs].slice(-LOG_LIMIT) });
    } catch (e) {
      set({ launching: false });
      get().logs.push({
        id: ++logSeq,
        text: `Ошибка запуска: ${e}`,
        time: nowTime(),
        kind: 'err',
      });
      set({ logs: [...get().logs].slice(-LOG_LIMIT), error: String(e) });
      throw e;
    }
  },

  cancelLaunch: async () => {
    try {
      const ok = await api.cancelLaunch();
      set({ launching: false });
      get().logs.push({
        id: ++logSeq,
        text: ok ? 'Запуск отменён' : 'Игра не запущена через лаунчер',
        time: nowTime(),
        kind: 'info',
      });
      set({ logs: [...get().logs].slice(-LOG_LIMIT) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  closeGame: async () => {
    try {
      const ok = await api.closeGame();
      get().logs.push({
        id: ++logSeq,
        text: ok
          ? 'Запрос на закрытие Minecraft...'
          : 'Игра не запущена через лаунчер',
        time: nowTime(),
        kind: 'info',
      });
      set({ logs: [...get().logs].slice(-LOG_LIMIT) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  captureConfig: async () => {
    try {
      const cfg = await api.captureConfig();
      const m = cfg.match(/--version\s+(\S+)/);
      const name = m ? m[1] : 'Авто-конфиг';
      const state = await api.pasteConfig(name, cfg);
      set({
        profiles: state.profiles,
        profile_configs: state.profile_configs,
        active_profile: state.active_profile,
        raw_config: state.raw_config,
        ram: state.ram,
      });
      get().logs.push({
        id: ++logSeq,
        text: `Конфиг захвачен и сохранён как «${name}»`,
        time: nowTime(),
        kind: 'info',
      });
      set({ logs: [...get().logs].slice(-LOG_LIMIT) });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  clearLogs: () => set({ logs: [] }),
  setGameRunning: (running) => set({ gameRunning: running }),
  setError: (error) => set({ error }),
}));