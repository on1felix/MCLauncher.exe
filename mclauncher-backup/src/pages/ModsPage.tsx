import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import {
  Puzzle,
  Image as ImageIcon,
  Search,
  Download,
  Check,
  Trash2,
  SearchX,
  Loader2,
  Package,
  Layers,
  Sparkles,
  FolderOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  api,
  type ModSearchHit,
  type ModProjectInfo,
  type ModVersion,
  type InstalledContent,
  type GameFile,
  type GameVersionTag,
  type LoaderTag,
  type BuiltinMod,
} from '../api';
import { toast } from '../components/Toast';
import Md, { openExternal } from '../components/Md';

const fmtNum = (n: number) =>
  n >= 1e6
    ? (n / 1e6).toFixed(1).replace('.0', '') + 'M'
    : n >= 1e3
      ? (n / 1e3).toFixed(1).replace('.0', '') + 'K'
      : String(n);

const fmtSize = (b: number) =>
  b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';

const fmtDate = (iso: string | number) => new Date(iso).toLocaleDateString('ru-RU');

// Числовой ключ игровой версии для сортировки ("1.21.1", "26.2-snapshot-3")
const gvKey = (s: string): number[] => s.split(/[^0-9]+/).filter(Boolean).map(Number);
const cmpKeys = (a: number[], b: number[]): number => {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
};
// Поддерживаемые версии игры по убыванию: [новейшая ... старейшая]
const gvSortedDesc = (gvs: string[]): string[] =>
  [...gvs].sort((x, y) => cmpKeys(gvKey(y), gvKey(x)));

// Красивые названия платформ (загрузчиков) для бейджей
const loaderNames: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
  iris: 'Iris',
  optifine: 'OptiFine',
  minecraft: 'Minecraft',
  vanilla: 'Vanilla',
};

interface DetailModal {
  hit: ModSearchHit;
  info: ModProjectInfo | null;
  versions: ModVersion[];
  loading: boolean;
}

export function ModsPage() {
  const [contentTab, setContentTab] = useState<'catalog' | 'installed'>('catalog');
  const [kind, setKind] = useState<'mod' | 'shader' | 'resourcepack' | 'client'>('mod');
  const [query, setQuery] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [hits, setHits] = useState<ModSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [installed, setInstalled] = useState<InstalledContent[]>([]);
  const [gameFiles, setGameFiles] = useState<GameFile[]>([]);
  const [projectInfo, setProjectInfo] = useState<Record<string, ModProjectInfo>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<DetailModal | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [loaderFilter, setLoaderFilter] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mcVersions, setMcVersions] = useState<GameVersionTag[]>([]);
  const [modLoaders, setModLoaders] = useState<LoaderTag[]>([]);
  const [selectedMc, setSelectedMc] = useState('');
  const [pickMode, setPickMode] = useState<'ver' | 'loader' | null>(null);
  const [pickSel, setPickSel] = useState('');
  const [modalTab, setModalTab] = useState<'versions' | 'desc' | 'gallery'>('versions');
  const [viewer, setViewer] = useState<number | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [builtinMods, setBuiltinMods] = useState<BuiltinMod[]>([]);
  const [togglingBuiltin, setTogglingBuiltin] = useState<string | null>(null);

  const loadRef = useRef(0);
  const savedMc = useRef('');

  // Прогресс установки из бэкенда
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ project_id: string; percent: number }>('mod-install-progress', (e) => {
      const { project_id, percent } = e.payload;
      if (percent >= 100) {
        setTimeout(() => {
          setProgressMap((m) => {
            const next = { ...m };
            delete next[project_id];
            return next;
          });
        }, 600);
      } else {
        setProgressMap((m) => ({ ...m, [project_id]: percent }));
      }
    }).then((f) => {
      unlisten = f;
    });
    return () => unlisten?.();
  }, []);
  const refreshInstalled = () => {
    api.getInstalled().then(setInstalled).catch(() => {});
    api.listGameFiles().then(setGameFiles).catch(() => {});
  };
  useEffect(() => {
    refreshInstalled();
  }, []);

  // Фото и название для модов, установленных через лаунчер:
  // берём project_id из записи установки и одним запросом получаем данные с Modrinth
  useEffect(() => {
    const byPath = new Map(installed.map((i) => [i.path.toLowerCase(), i.project_id]));
    const byName = new Map(installed.map((i) => [i.file_name, i.project_id]));
    const ids = [
      ...new Set(
        gameFiles
          .map((f) => byPath.get(f.path.toLowerCase()) ?? byName.get(f.file_name))
          .filter((x): x is string => !!x && !projectInfo[x])
      ),
    ];
    if (ids.length === 0) return;
    api.modrinthProjects(ids).then((list) => {
      setProjectInfo((prev) => {
        const next = { ...prev };
        for (const p of list) if (p.project_id) next[p.project_id] = p;
        return next;
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed, gameFiles]);

  // Поиск с дебаунсом
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Версии игры и загрузчики с Modrinth (обновляются автоматически)
  useEffect(() => {
    api.modrinthGameVersions().then(setMcVersions).catch(() => {});
    api.modrinthLoaders().then(setModLoaders).catch(() => {});
  }, []);

  // Все версии по убыванию; для выбора показываем только релизы
  const allGvs = useMemo(
    () => [...mcVersions].sort((a, b) => cmpKeys(gvKey(b.version), gvKey(a.version))),
    [mcVersions]
  );
  const releases = useMemo(
    () => allGvs.filter((v) => v.version_type === 'release'),
    [allGvs]
  );

  // По умолчанию — сохранённая версия, иначе самая новая релизная
  useEffect(() => {
    if (!selectedMc && allGvs.length > 0 && !savedMc.current) {
      const newest = allGvs.find((v) => v.version_type === 'release')?.version ?? '';
      if (newest) setSelectedMc(newest);
    }
  }, [allGvs, selectedMc]);

  // Загружаем сохранённый выбор при старте
  useEffect(() => {
    api.getModsPrefs().then((p) => {
      if (p.mc_version) {
        savedMc.current = p.mc_version;
        setSelectedMc(p.mc_version);
      }
      if (p.loader) setLoaderFilter(p.loader);
    }).catch(() => {});
  }, []);

  const persistPrefs = (mc: string, ld: string | null) => {
    api.setModsPrefs(mc, ld ?? '').catch(() => {});
  };

  const load = async (offset: number, append: boolean) => {
    const seq = ++loadRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await api.modrinthSearch(searchQ, kind, selectedMc || 'all', offset);
      if (seq !== loadRef.current) return;
      setHits((prev) => (append ? [...prev, ...res.hits] : res.hits));
      setTotal(res.total);
    } catch (e) {
      if (seq === loadRef.current) toast(String(e), 'error');
    } finally {
      if (seq === loadRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, searchQ, selectedMc]);

  // Встроенные моды клиента (идут в комплекте с лаунчером)
  const refreshBuiltin = () => {
    api.getBuiltinMods().then(setBuiltinMods).catch(() => {});
  };
  useEffect(() => {
    refreshBuiltin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Просмотрщик галереи: стрелки клавиатуры и Esc
  useEffect(() => {
    setImgLoaded(false);
  }, [viewer]);

  useEffect(() => {
    if (viewer === null || !detail?.info) return;
    const total = detail.info.gallery.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
      else if (e.key === 'ArrowRight') setViewer((v) => (v === null ? null : (v + 1) % total));
      else if (e.key === 'ArrowLeft') setViewer((v) => (v === null ? null : (v - 1 + total) % total));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer === null, detail?.info?.project_id]);

  const handleToggleBuiltin = async (m: BuiltinMod) => {
    const target = !m.installed;
    setTogglingBuiltin(m.id);
    try {
      await api.setBuiltinMod(m.id, target);
      toast(target ? `${m.title} включён` : `${m.title} выключен`);
      refreshBuiltin();
      refreshInstalled();
    } catch (e) {
      toast(String(e), 'error');
      refreshBuiltin();
    } finally {
      setTogglingBuiltin(null);
    }
  };

  const handleOpenGameDir = async () => {
    try {
      const dir = await api.openGameDir();
      toast(`Открыта папка: ${dir}`);
    } catch (e) {
      toast(String(e), 'error');
    }
  };

  // Окно мода: описание + все версии (выбранный загрузчик и версия игры сохраняются)
  const openDetails = async (hit: ModSearchHit) => {
    setSelectedVersion(null);
    setModalTab('versions');
    setDetail({ hit, info: null, versions: [], loading: true });
    try {
      const [info, versions] = await Promise.all([
        api.modrinthProject(hit.project_id),
        api.modrinthVersions(hit.project_id, 'all'),
      ]);
      setDetail({ hit, info, versions, loading: false });
    } catch (e) {
      toast(String(e), 'error');
      setDetail(null);
    }
  };

  // Окно мода из списка установленных: собираем хит из сохранённых данных
  const openInstalledDetails = (
    rec: InstalledContent,
    info?: ModProjectInfo,
    fileName?: string
  ) => {
    if (!rec.project_id) return;
    openDetails({
      project_id: rec.project_id,
      slug: '',
      title: info?.title || rec.title || fileName || rec.file_name,
      description: info?.description || '',
      author: '',
      icon_url: info?.icon_url || '',
      downloads: info?.downloads ?? 0,
      follows: info?.follows ?? 0,
      categories: info?.categories ?? [],
    });
  };

  const doInstall = async () => {
    if (!detail || !selectedVersion) return;
    const v = detail.versions.find((x) => x.id === selectedVersion);
    if (!v) return;
    setInstalling(true);
    try {
      await api.installModrinth({
        projectId: detail.hit.project_id,
        title: detail.hit.title,
        kind,
        versionId: v.id,
        versionNumber: v.version_number,
        fileName: v.file_name,
        fileUrl: v.file_url,
      });
      toast(`Установлено: ${detail.hit.title}`);
      setDetail(null);
      refreshInstalled();
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setInstalling(false);
    }
  };

  const handleDeleteFile = async (item: GameFile) => {
    try {
      await api.deleteGameFile(item.path);
      toast(`Удалено: ${item.file_name}`);
      refreshInstalled();
    } catch (e) {
      toast(String(e), 'error');
    }
    setConfirmDelete(null);
  };

  const installedIds = new Set(
    installed.filter((i) => i.kind === kind).map((i) => i.project_id)
  );
  const filesForKind = gameFiles.filter((f) => f.kind === kind);

  // Поиск в установленных: по названию с Modrinth и по имени файла
  const q = query.trim().toLowerCase();
  const visibleFiles = q
    ? filesForKind.filter((item) => {
        const rec = installed.find((i) => i.path.toLowerCase() === item.path.toLowerCase());
        const info = rec ? projectInfo[rec.project_id] : undefined;
        return `${info?.title || ''} ${rec?.title || ''} ${item.file_name}`
          .toLowerCase()
          .includes(q);
      })
    : filesForKind;

  // Загрузчик имеет смысл только для модов; у ресурспаков он всегда "minecraft"
  const loaderRelevant = kind === 'mod';

  const filteredVersions =
    detail?.versions.filter(
      (v) =>
        (!loaderRelevant || !loaderFilter || v.loaders.includes(loaderFilter)) &&
        (!selectedMc || v.game_versions.includes(selectedMc))
    ) ?? [];

  // Смена загрузчика/версии: если выбранная версия скрыта фильтром — сбрасываем выбор
  useEffect(() => {
    if (selectedVersion && !filteredVersions.some((v) => v.id === selectedVersion)) {
      setSelectedVersion(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderFilter, selectedMc]);

  // Сортировка версий по поддерживаемой версии игры (нижняя строка), свежие сверху
  const sortedVersions = useMemo(() => {
    const list = [...filteredVersions];
    list.sort((a, b) => {
      const ka = gvSortedDesc(a.game_versions)[0] ?? '';
      const kb = gvSortedDesc(b.game_versions)[0] ?? '';
      const d = cmpKeys(gvKey(kb), gvKey(ka));
      return d !== 0 ? d : +new Date(b.date_published) - +new Date(a.date_published);
    });
    return list;
  }, [filteredVersions]);

  return (
    <div className="max-w-[1600px] mx-auto w-full transition-[max-width] duration-300 ease-out">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold">Моды</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary mr-1">
              {kind === 'client' ? 'Моды клиента' : 'Каталог Modrinth'}
            </span>
            {kind !== 'client' && (
              <button
                onClick={handleOpenGameDir}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg/50 border border-border text-sm
                  text-text-secondary transition-[color,border-color,box-shadow] duration-200
                  hover:text-white/90 hover:border-accent/50 hover:shadow-[0_0_12px_rgba(255,123,29,0.25)]"
              >
                <FolderOpen className="w-4 h-4 text-accent" />
                Папка игры
              </button>
            )}
          </div>
        </div>

        {/* Панель: табы контента */}
        {kind !== 'client' && (
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex gap-1 p-1 rounded-lg bg-bg/60 border border-border">
              {([['catalog', 'Каталог'], ['installed', `Установленные (${filesForKind.length})`]] as const).map(
                ([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setContentTab(id)}
                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                      contentTab === id
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'text-text-secondary hover:text-white/90 border border-transparent'
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Панель: тип (в каталоге) + поиск */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {contentTab === 'catalog' && (
            <div className="flex gap-1 p-1 rounded-lg bg-bg/60 border border-border">
              {([
                ['mod', 'Моды', Puzzle],
                ['shader', 'Шейдеры', Sparkles],
                ['resourcepack', 'Ресурспаки', ImageIcon],
                ['client', 'Моды клиента', Layers],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setKind(id)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                    kind === id
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'text-text-secondary hover:text-white/90 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1 min-w-[220px] max-w-[420px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                contentTab === 'installed'
                  ? 'Поиск в установленных...'
                  : kind === 'client'
                    ? 'Поиск'
                    : 'Поиск на Modrinth...'
              }
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-transparent border border-border text-white/90 text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {contentTab === 'catalog' ? (
          <>
            {kind === 'client' ? (
              /* Моды клиента — встроенные, ставятся в один клик */
              builtinMods.length === 0 ? (
                <div className="bg-bg/50 rounded-lg border border-dashed border-border p-10 text-center">
                  <Layers className="w-12 h-12 text-text-muted mx-auto mb-4" />
                  <p className="text-text-secondary">Встроенные моды недоступны.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {builtinMods.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="relative flex gap-3 p-4 rounded-lg bg-bg/50 border border-border"
                    >
                      <div className="w-14 h-14 rounded-lg shrink-0 border border-border bg-card flex items-center justify-center">
                        <Puzzle className="w-6 h-6 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-white/90 truncate block">{m.title}</span>
                            <span className="text-[11px] text-text-secondary mt-0.5 block">
                              {m.author} · v{m.version_number} · Minecraft {m.mc_versions.join(', ')}
                            </span>
                          </div>
                          <div className="shrink-0 flex items-center">
                            <button
                              role="switch"
                              aria-checked={m.installed}
                              disabled={togglingBuiltin === m.id}
                              onClick={() => handleToggleBuiltin(m)}
                              className={`relative w-[46px] h-[22px] rounded-md border overflow-hidden cursor-pointer
                                transition-colors duration-300 disabled:pointer-events-none ${
                                  m.installed ? 'bg-white/[0.05] border-accent/50' : 'bg-white/[0.03] border-border'
                                }`}
                            >
                              {/* Ручка */}
                              <motion.span
                                initial={false}
                                animate={{ x: m.installed ? 23 : 3 }}
                                transition={{ type: 'spring', stiffness: 430, damping: 24 }}
                                className={`absolute top-[2px] left-0 w-[18px] h-[16px] rounded-[4px]
                                  border flex items-center justify-center text-[7px] font-bold leading-none tracking-wide
                                  transition-[background-color,color,border-color] duration-300 ${
                                    m.installed
                                      ? 'bg-accent text-white border-accent/90'
                                      : 'bg-white/[0.05] text-text-secondary border-white/[0.20]'
                                  }`}
                              >
                                {m.installed ? 'ON' : 'OFF'}
                              </motion.span>
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-text-secondary line-clamp-2 mt-1">{m.description}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="px-2 py-0.5 rounded-pill bg-transparent border border-white/15 text-[11px] text-text-secondary capitalize">
                            fabric
                          </span>
                          <span className="px-2 py-0.5 rounded-pill bg-transparent border border-white/15 text-[11px] text-text-secondary">
                            клиентский
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )
            ) : loading ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3 p-4 rounded-lg bg-bg/50 border border-border animate-pulse">
                    <div className="w-14 h-14 rounded-lg bg-white/5 shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 w-1/3 rounded bg-white/5" />
                      <div className="h-3 w-full rounded bg-white/5" />
                      <div className="h-3 w-2/3 rounded bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : hits.length === 0 ? (
              <div className="bg-bg/50 rounded-lg border border-dashed border-border p-10 text-center">
                <SearchX className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <p className="text-text-secondary">Ничего не найдено. Попробуйте другой запрос.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {hits.map((hit) => {
                    const pct = progressMap[hit.project_id];
                    const isInstalled = installedIds.has(hit.project_id);
                    return (
                      <motion.div
                        key={hit.project_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        onClick={() => {
                          if (pct === undefined) openDetails(hit);
                        }}
                        className="relative flex gap-3 p-4 rounded-lg bg-bg/50 border border-border hover:border-accent/40 hover:bg-accent/[0.03] transition-colors duration-200 cursor-pointer"
                      >
                        {hit.icon_url ? (
                          <img
                            src={hit.icon_url}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border bg-card"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg shrink-0 border border-border bg-card flex items-center justify-center">
                            <Package className="w-6 h-6 text-text-muted" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 flex flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-white/90 truncate block">{hit.title}</span>
                              <span className="text-[11px] text-text-secondary mt-0.5 block">
                                {hit.author} · ⬇ {fmtNum(hit.downloads)} · ♥ {fmtNum(hit.follows)}
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetails(hit);
                              }}
                              disabled={pct !== undefined}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-[color,border-color,box-shadow] duration-200 disabled:opacity-70 ${
                                isInstalled
                                  ? 'bg-transparent border-2 border-success/40 text-success/90 hover:border-success hover:text-success hover:shadow-[0_0_10px_rgba(52,199,89,0.35)]'
                                  : 'bg-transparent border-2 border-accent/40 text-accent/90 hover:border-accent hover:text-accent hover:shadow-[0_0_10px_rgba(255,123,29,0.35)]'
                              }`}
                            >
                              {pct !== undefined ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  {Math.round(pct)}%
                                </>
                              ) : isInstalled ? (
                                <>
                                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                  Установлено
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5" />
                                  Установить
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-text-secondary line-clamp-2 mt-1">{hit.description}</p>
                          {hit.categories.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 overflow-hidden">
                              {hit.categories.slice(0, 4).map((c) => (
                                <span
                                  key={c}
                                  className="px-2 py-0.5 rounded-pill bg-transparent border border-white/15 text-[11px] text-text-secondary capitalize"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {hits.length < total && (
                  <div className="flex justify-center mt-5">
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => load(hits.length, true)}
                      disabled={loadingMore}
                      className="px-6 py-2.5 rounded-lg bg-bg/60 border-2 border-accent/40 text-accent/90 text-sm font-medium
                        transition-[color,border-color,box-shadow] duration-200 hover:border-accent hover:text-accent hover:shadow-[0_0_10px_rgba(255,123,29,0.35)]
                        disabled:opacity-60 flex items-center gap-2"
                    >
                      {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                      Показать ещё
                    </motion.button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          /* Установленные: все файлы из папки игры */
          visibleFiles.length === 0 ? (
            filesForKind.length === 0 ? (
              <div className="bg-bg/50 rounded-lg border border-dashed border-border p-10 text-center">
                <Package className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <p className="text-text-secondary">
                  В папке игры пока пусто.<br />
                  Установите моды, шейдеры или ресурспаки через каталог — или скопируйте файлы вручную.
                </p>
              </div>
            ) : (
              <div className="bg-bg/50 rounded-lg border border-dashed border-border p-10 text-center">
                <SearchX className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <p className="text-text-secondary">Ничего не найдено по вашему запросу.</p>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2.5">
              {visibleFiles.map((item) => {
                const rec = installed.find(
                  (i) => i.path.toLowerCase() === item.path.toLowerCase()
                );
                const info = rec ? projectInfo[rec.project_id] : undefined;
                const clickable = !!rec?.project_id && confirmDelete === null;
                return (
                <motion.div
                  key={item.path}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  onClick={() => {
                    if (clickable) openInstalledDetails(rec!, info, item.file_name);
                  }}
                  className={`relative flex items-center gap-4 p-4 rounded-lg bg-bg/50 border border-border transition-colors duration-200 ${
                    rec?.project_id
                      ? 'cursor-pointer hover:border-accent/40 hover:bg-accent/[0.03]'
                      : ''
                  }`}
                >
                  {info?.icon_url ? (
                    <img
                      src={info.icon_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border bg-card"
                      draggable={false}
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-border bg-card">
                      {item.kind === 'resourcepack' ? (
                        <ImageIcon className="w-5 h-5 text-accent" />
                      ) : item.kind === 'shader' ? (
                        <Sparkles className="w-5 h-5 text-accent" />
                      ) : (
                        <Puzzle className="w-5 h-5 text-accent" />
                      )}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-white/90 truncate min-w-0">
                        {info?.title || item.file_name}
                      </span>
                      {item.from_launcher ? (
                        <motion.span
                          initial={false}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-transparent border border-accent/40 text-accent/90 text-[10px] font-medium whitespace-nowrap shrink-0"
                        >
                          через лаунчер
                        </motion.span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-pill bg-transparent border border-white/15 text-text-secondary text-[11px] whitespace-nowrap shrink-0">
                          вручную
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5 truncate">
                      {info ? `${item.file_name} · ` : ''}{fmtSize(item.size)} · установлен {fmtDate(item.modified)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <AnimatePresence mode="wait">
                      {confirmDelete === item.path ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex items-center gap-2"
                        >
                          <span className="text-xs text-text-secondary">Удалить?</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(item);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-danger text-white/90 text-xs font-medium hover:bg-danger/80 transition-colors"
                          >
                            Да
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(null);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-bg/60 text-text-secondary text-xs font-medium hover:text-white/90 transition-colors"
                          >
                            Нет
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="actions"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(item.path);
                          }}
                          className="p-2 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
                );
              })}
            </div>
          )
        )}
      </motion.div>

      {/* Окно мода: описание, лоадеры, выбор версии */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-[600px] max-w-[94vw] rounded-2xl bg-[#16161a]/70 backdrop-blur-md border border-border/80 shadow-2xl shadow-black/70 gradient-border flex flex-col h-[85vh]"
            >
              {detail.loading ? (
                <div className="py-16 flex justify-center">
                  <Loader2 className="w-7 h-7 text-accent animate-spin" />
                </div>
              ) : (
                <>
                  {/* Шапка */}
                  <div className="flex items-start gap-3.5 p-5 pb-4 border-b border-border/60">
                    {detail.info?.icon_url || detail.hit.icon_url ? (
                      <img
                        src={detail.info?.icon_url || detail.hit.icon_url}
                        alt=""
                        className="w-16 h-16 rounded-xl object-cover shrink-0 border border-border bg-card"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl shrink-0 border border-border bg-card flex items-center justify-center">
                        <Package className="w-7 h-7 text-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold text-white/90 truncate">
                        {detail.info?.title || detail.hit.title}
                      </div>
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        {detail.hit.author} · ⬇ {fmtNum(detail.info?.downloads ?? detail.hit.downloads)} · ♥{' '}
                        {fmtNum(detail.info?.follows ?? detail.hit.follows)}
                      </div>
                      {(detail.info?.categories.length ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {detail.info!.categories.slice(0, 5).map((c) => (
                            <span
                              key={c}
                              className="px-2 py-0.5 rounded-pill bg-transparent border border-white/15 text-[11px] text-text-secondary capitalize"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Панель: кнопки версии/загрузчика + вкладки с ползунком */}
                  <div className="px-5 pt-3 pb-2.5 flex items-center justify-between gap-3 shrink-0 border-b border-border/40">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setPickSel(selectedMc);
                          setPickMode('ver');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg/60 border border-border text-xs font-medium
                          text-text-secondary transition-[color,border-color,box-shadow] duration-200
                          hover:text-white/90 hover:border-accent/50 hover:shadow-[0_0_10px_rgba(255,123,29,0.25)]"
                      >
                        Версия: {selectedMc || '…'}
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {loaderRelevant && (
                        <button
                          onClick={() => {
                            setPickSel(loaderFilter ?? '');
                            setPickMode('loader');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg/60 border border-border text-xs font-medium
                            text-text-secondary transition-[color,border-color,box-shadow] duration-200
                            hover:text-white/90 hover:border-accent/50 hover:shadow-[0_0_10px_rgba(255,123,29,0.25)]"
                        >
                          <span className="capitalize">{loaderFilter ?? 'Загрузчик'}</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-0.5 p-0.5 rounded-lg bg-bg/60 border border-border shrink-0">
                      {([
                        ['versions', 'Версии'],
                        ['desc', 'Описание'],
                        ['gallery', 'Галерея'],
                      ] as const).map(([id, label]) => {
                        const galleryEmpty =
                          id === 'gallery' && !(detail.info && detail.info.gallery.length > 0);
                        return (
                          <button
                            key={id}
                            onClick={() => setModalTab(id)}
                            disabled={galleryEmpty}
                            title={galleryEmpty ? 'У мода нет галереи' : undefined}
                            className={`relative px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                              modalTab === id
                                ? 'text-accent'
                                : galleryEmpty
                                  ? 'text-text-secondary/40 cursor-not-allowed'
                                  : 'text-text-secondary hover:text-white/90'
                            }`}
                          >
                            {modalTab === id && (
                              <motion.span
                                layoutId="mod-tab-pill"
                                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                className="absolute inset-0 rounded-md bg-accent/15 border border-accent/30"
                              />
                            )}
                            <span className="relative z-10">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Контент вкладок */}
                  <div className="flex-1 min-h-0 px-5 pt-3 flex flex-col overflow-hidden">
                    {modalTab === 'versions' && (
                      <>
                        {loaderRelevant && loaderFilter && (
                          <div className="flex items-center gap-2 mb-2 shrink-0">
                            <span className="text-[11px] text-text-secondary">
                              Загрузчик: <span className="text-accent capitalize">{loaderFilter}</span>
                            </span>
                            <button
                              onClick={() => setLoaderFilter(null)}
                              className="text-[11px] text-text-secondary underline-offset-2 hover:underline hover:text-white/90 transition-colors"
                            >
                              сбросить
                            </button>
                          </div>
                        )}

                        <div className="flex flex-col gap-1 pb-3 pr-1 flex-1 min-h-0 overflow-y-auto">
                          {filteredVersions.length === 0 ? (
                            <div className="py-6 text-center text-xs text-text-secondary">
                              Нет версий для выбранных игры и загрузчика.
                            </div>
                          ) : (
                            sortedVersions.map((v) => {
                              const isSel = selectedVersion === v.id;
                              const g = gvSortedDesc(v.game_versions);
                              return (
                                <button
                                  key={v.id}
                                  onClick={() => setSelectedVersion(v.id)}
                                  className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors duration-200 text-left shrink-0 ${
                                    isSel
                                      ? 'border-accent bg-accent/[0.08]'
                                      : 'border-transparent hover:border-border hover:bg-white/[0.03]'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className={`text-sm font-medium truncate ${isSel ? 'text-accent' : 'text-white/90'}`}>
                                      {v.version_number}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                      {g.map((ver) => (
                                        <span
                                          key={ver}
                                          className="px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/30 text-accent text-[10px] font-medium whitespace-nowrap"
                                        >
                                          {ver}
                                        </span>
                                      ))}
                                      {v.loaders.map((ld) => (
                                        <span
                                          key={ld}
                                          className="px-1.5 py-0.5 rounded-md bg-bg/60 border border-white/15 text-text-secondary text-[10px] font-medium whitespace-nowrap"
                                        >
                                          {loaderNames[ld] || ld}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="text-[11px] text-text-secondary mt-1.5">
                                      {fmtDate(v.date_published)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 self-start pt-1">
                                    <span className="text-[11px] text-text-secondary tabular-nums">{fmtSize(v.file_size)}</span>
                                    {isSel && <Check className="w-4 h-4 text-accent" strokeWidth={3} />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}

                    {modalTab === 'desc' && (
                      <div className="flex-1 min-h-0 overflow-y-auto pr-2 pb-3 [scrollbar-gutter:stable]">
                        {detail.info?.body?.trim() ? (
                          <Md source={detail.info.body} baseUrl={`https://modrinth.com/mod/${detail.hit.slug}`} />
                        ) : (
                          <p className="text-xs text-text-secondary leading-relaxed">
                            {detail.info?.description || detail.hit.description}
                          </p>
                        )}
                      </div>
                    )}

                    {modalTab === 'gallery' && (
                      <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-3">
                        {(detail.info?.gallery?.length ?? 0) === 0 ? (
                          <div className="py-6 text-center text-xs text-text-secondary">
                            Галерея для этого мода пуста.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {detail.info!.gallery.map((g, i) => (
                              <button
                                key={i}
                                onClick={() => setViewer(i)}
                                className="block group text-left cursor-pointer"
                              >
                                <img
                                  src={g.url}
                                  alt={g.title || ''}
                                  draggable={false}
                                  className="w-full aspect-video object-cover rounded-lg border border-border
                                    group-hover:border-accent/50 transition-colors"
                                />
                                {g.title && (
                                  <div className="text-[11px] text-text-secondary mt-1 truncate">{g.title}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Футер */}
                  <div className="flex items-center justify-end gap-2 p-5 pt-4 border-t border-border/60">
                    <button
                      onClick={() => setDetail(null)}
                      className="px-5 py-2 rounded-lg bg-bg/60 border-2 border-success/40 text-success/90 text-sm font-medium
                        transition-[color,border-color] duration-200 hover:border-success hover:text-success"
                    >
                      Закрыть
                    </button>
                    <button
                      onClick={doInstall}
                      disabled={!selectedVersion || installing}
                      className="flex items-center gap-2 px-5 py-2 rounded-lg bg-transparent border-2 border-accent/40 text-accent/90 text-sm font-medium
                        transition-[color,border-color,box-shadow] duration-200 hover:border-accent hover:text-accent hover:shadow-[0_0_10px_rgba(255,123,29,0.35)]
                        disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {installing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Установка...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Установить
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Мини-окно выбора версии игры */}
      <AnimatePresence>
        {pickMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-[340px] max-w-[90vw] rounded-2xl bg-[#16161a]/85 backdrop-blur-md border border-border/80
                shadow-2xl shadow-black/70 gradient-border p-5"
            >
              <div className="text-base font-semibold text-white/90 pb-3 mb-0 border-b border-border/60">
                {pickMode === 'ver' ? 'Версия игры' : 'Загрузчик'}
              </div>
              <div className="max-h-[300px] overflow-y-auto pr-1 flex flex-col gap-1 py-3">
                {pickMode === 'ver'
                  ? releases.length === 0
                    ? <div className="py-6 text-center text-xs text-text-secondary">Загрузка версий...</div>
                    : releases.map((v) => {
                        const isSel = pickSel === v.version;
                        return (
                          <button
                            key={v.version}
                            onClick={() => setPickSel(v.version)}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors duration-150 ${
                              isSel
                                ? 'border-accent bg-accent/[0.08] text-accent'
                                : 'border-transparent text-text-secondary hover:text-white/90 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="text-sm font-medium">{v.version}</span>
                            {isSel && <Check className="w-4 h-4 shrink-0" strokeWidth={3} />}
                          </button>
                        );
                      })
                  : [
                      { name: '', label: 'Все загрузчики' },
                      ...modLoaders.map((l) => ({ name: l.name, label: l.name })),
                    ].map((l) => {
                      const isSel = pickSel === l.name;
                      return (
                        <button
                          key={l.label}
                          onClick={() => setPickSel(l.name)}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors duration-150 ${
                            isSel
                              ? 'border-accent bg-accent/[0.08] text-accent'
                              : 'border-transparent text-text-secondary hover:text-white/90 hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="text-sm font-medium capitalize">{l.label}</span>
                          {isSel && <Check className="w-4 h-4 shrink-0" strokeWidth={3} />}
                        </button>
                      );
                    })}
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
                <button
                  onClick={() => setPickMode(null)}
                  className="px-5 py-2 rounded-lg bg-bg/60 border-2 border-success/40 text-success/90 text-sm font-medium
                    transition-[color,border-color] duration-200 hover:border-success hover:text-success"
                >
                  Закрыть
                </button>
                <button
                  onClick={() => {
                    if (pickMode === 'ver') {
                      if (pickSel) {
                        setSelectedMc(pickSel);
                        savedMc.current = pickSel;
                        persistPrefs(pickSel, loaderFilter);
                      }
                    } else {
                      setLoaderFilter(pickSel || null);
                      persistPrefs(selectedMc, pickSel || null);
                    }
                    setPickMode(null);
                  }}
                  disabled={pickMode === 'ver' ? !pickSel : false}
                  className="px-5 py-2 rounded-lg bg-transparent border-2 border-accent/40 text-accent/90 text-sm font-medium
                    transition-[color,border-color,box-shadow] duration-200 hover:border-accent hover:text-accent hover:shadow-[0_0_10px_rgba(255,123,29,0.35)]
                    disabled:opacity-40 disabled:pointer-events-none"
                >
                  Выбрать
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Просмотрщик скринов мода */}
      <AnimatePresence>
        {viewer !== null && detail?.info && detail.info.gallery[viewer] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md"
          >
            <button
              onClick={() => setViewer(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-bg/70 border border-border text-text-secondary
                hover:text-white/90 hover:border-accent/60 transition-colors flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 md:gap-5">
              {detail.info.gallery.length > 1 && (
                <button
                  onClick={() => setViewer((v) => (v === null ? null : (v - 1 + detail.info!.gallery.length) % detail.info!.gallery.length))}
                  className="w-11 h-11 rounded-full bg-bg/70 border border-border text-text-secondary shrink-0
                    hover:text-accent hover:border-accent/60 hover:bg-accent/10 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Кадр фиксированного размера — кнопки не смещаются при загрузке */}
              <div className="relative w-[min(1150px,76vw)] h-[74vh] flex items-center justify-center">
                {!imgLoaded && (
                  <Loader2 className="absolute w-8 h-8 animate-spin text-accent/80 pointer-events-none" />
                )}
                <AnimatePresence mode="wait">
                  <motion.img
                    key={viewer}
                    src={detail.info.gallery[viewer].raw_url || detail.info.gallery[viewer].url}
                    alt={detail.info.gallery[viewer].title || ''}
                    onLoad={() => setImgLoaded(true)}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: imgLoaded ? 1 : 0, scale: imgLoaded ? 1 : 0.99 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    draggable={false}
                    className="max-w-full max-h-full rounded-xl border border-border/80 object-contain shadow-2xl shadow-black/70 select-none"
                  />
                </AnimatePresence>
              </div>

              {detail.info.gallery.length > 1 && (
                <button
                  onClick={() => setViewer((v) => (v === null ? null : (v + 1) % detail.info!.gallery.length))}
                  className="w-11 h-11 rounded-full bg-bg/70 border border-border text-text-secondary shrink-0
                    hover:text-accent hover:border-accent/60 hover:bg-accent/10 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-col items-center gap-1 max-w-[80vw]">
              {(detail.info.gallery[viewer].title || detail.info.gallery[viewer].description) && (
                <div className="text-sm text-white/90 text-center line-clamp-2">
                  {detail.info.gallery[viewer].title || detail.info.gallery[viewer].description}
                </div>
              )}
              {detail.info.gallery.length > 1 && (
                <div className="text-xs text-text-secondary tabular-nums">
                  {viewer + 1} / {detail.info.gallery.length} · ← →
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
