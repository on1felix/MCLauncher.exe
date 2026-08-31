import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Gamepad2, Pencil, Trash2, Check } from 'lucide-react';
import { useAppStore } from '../store';
import { toast } from '../components/Toast';

function profileVersion(cfg: string | undefined): string {
  if (!cfg) return '';
  const m = cfg.match(/--version\s+(\S+)/);
  return m ? m[1] : '';
}

export function ProfilesPage() {
  const { profiles, active_profile, profile_configs, activateProfile, renameProfile, deleteProfile } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleSelect = async (name: string) => {
    if (name === active_profile) return;
    try {
      await activateProfile(name);
      toast(`Выбран профиль: ${name}`);
    } catch (e) {
      toast(String(e), 'error');
    }
  };

  const handleRenameStart = (oldName: string) => {
    setEditingId(oldName);
    setEditValue(oldName);
  };

  const handleRenameSave = async () => {
    if (!editingId) return;
    const newName = editValue.trim();
    if (!newName || newName === editingId) {
      setEditingId(null);
      return;
    }
    await renameProfile(editingId, newName);
    toast(`Профиль переименован: ${newName}`);
    setEditingId(null);
  };

  const handleDelete = async (name: string) => {
    await deleteProfile(name);
    toast(`Профиль удалён: ${name}`);
    setConfirmDelete(null);
  };

  return (
    <div className="max-w-[1600px] mx-auto w-full transition-[max-width] duration-300 ease-out">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold">Профили</h2>
            {profiles.length > 0 && (
              <span className="text-xs text-text-muted bg-bg-2/60 px-3 py-1.5 rounded-pill border border-border">
                {profiles.length} {profiles.length === 1 ? 'профиль' : profiles.length < 5 ? 'профиля' : 'профилей'}
              </span>
            )}
          </div>
          <span className="text-xs text-text-muted">
            Нажмите на профиль, чтобы выбрать
          </span>
        </div>

        {profiles.length === 0 ? (
          <div className="bg-bg/50 rounded-lg border border-dashed border-border p-10 text-center">
            <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-secondary">
              Профилей пока нет.<br />
              Создайте профиль через «Вставить конфиг» или «Захват конфига».
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {profiles.map((p) => {
              const isActive = p === active_profile;
              const isEditing = editingId === p;
              const isDeleting = confirmDelete === p;
              const version = profileVersion(profile_configs[p]);

              return (
                <motion.div
                  key={p}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  onClick={() => handleSelect(p)}
                  className={`
                    relative flex items-center gap-4 p-4 rounded-lg bg-bg/50 border cursor-pointer
                    transition-colors duration-200
                    ${isActive
                      ? 'border-accent bg-accent/[0.06]'
                      : 'border-border hover:border-accent/40 hover:bg-accent/[0.03]'
                    }
                  `}
                >
{/* Иконка профиля */}
                  <motion.span
                    initial={false}
                    animate={{
                      color: isActive ? '#ff7b1d' : '#656571',
                      backgroundColor: isActive ? 'rgba(255,123,29,0.1)' : 'rgba(24,24,28,0.6)',
                      borderColor: isActive ? 'rgba(255,123,29,0.4)' : '#1c1c20',
                    }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
                  >
                    <Gamepad2 className="w-5 h-5" />
                  </motion.span>
                  {/* Информация */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSave();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={handleRenameSave}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-3 py-1.5 rounded bg-card border border-accent text-white/90 text-sm
                          focus:outline-none"
                      />
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-sm font-medium truncate min-w-0 transition-colors duration-200 ${isActive ? 'text-accent' : 'text-white/90'}`}>
                            {p}
                          </span>
                          <motion.span
                            initial={false}
                            animate={{ opacity: isActive ? 1 : 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-accent/15 border border-accent/30 text-accent text-[11px] font-medium whitespace-nowrap shrink-0"
                          >
                            <Check className="w-3 h-3" strokeWidth={3} />
                            активный
                          </motion.span>
                        </div>
                        <span className={`text-xs mt-1 truncate block transition-colors duration-200 ${isActive ? 'text-[#b8b8c0]' : 'text-text-muted'}`}>
                          {version ? `Версия: ${version}` : 'Версия: —'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Действия */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <AnimatePresence mode="wait">
                      {isDeleting ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex items-center gap-2"
                        >
                          <span className="text-xs text-text-secondary">Удалить?</span>
                          <button
                            onClick={() => handleDelete(p)}
                            className="px-3 py-1.5 rounded-lg bg-danger text-white/90 text-xs font-medium hover:bg-danger/80 transition-colors"
                          >
                            Да
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-3 py-1.5 rounded-lg bg-bg/60 text-text-secondary text-xs font-medium hover:text-white/90 transition-colors"
                          >
                            Нет
                          </button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="actions"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2"
                        >
                          <button
                            onClick={() => handleRenameStart(p)}
                            className="p-2 rounded-lg text-text-secondary hover:text-white/90 hover:bg-white/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(p)}
                            className="p-2 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}