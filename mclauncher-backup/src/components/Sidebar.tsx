import { motion } from 'framer-motion';
import { Home, Settings, Users, Clipboard, HelpCircle, Gamepad2, Puzzle } from 'lucide-react';
import { useAppStore } from '../store';
import { SkinHead } from './SkinHead';
import type { Screen } from '../App';

interface NavItem {
  id: Screen;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'launch', label: 'Настройки', icon: Settings },
  { id: 'profiles', label: 'Профили', icon: Users },
  { id: 'paste', label: 'Вставить конфиг', icon: Clipboard },
  { id: 'mods', label: 'Моды', icon: Puzzle },
  { id: 'help', label: 'Инструкция', icon: HelpCircle },
];

interface SidebarProps {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

export function Sidebar({ activeScreen, onNavigate }: SidebarProps) {
  const { nickname, active_profile } = useAppStore();

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col bg-bg/50 backdrop-blur-lg border-r border-border/40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <SkinHead nick={nickname} size={44} />
        <div className="min-w-0">
          <div className="text-lg font-semibold tracking-wide truncate"
            style={{ fontFamily: "'PauzaStencil', 'Onest', sans-serif" }}>
            {nickname}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-3 mt-2">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeScreen === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`
                relative flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium
                [transition:background-color_0.25s_ease-in-out,color_0.25s_ease-in-out,transform_0.2s_cubic-bezier(0.4,0,0.2,1)] text-left
                ${isActive
                  ? 'text-white/90 bg-white/[0.07] translate-x-1.5'
                  : 'text-text-secondary hover:text-white/90 hover:bg-white/[0.05] translate-x-0'
                }
              `}
            >
              {/* Палочка — внутри кнопки, всегда приклеена к выбранной категории */}
              <motion.span
                initial={false}
                animate={{ opacity: isActive ? 1 : 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[46%] rounded-full bg-accent
                  shadow-[0_0_5px_1px_rgba(255,123,29,0.4)]"
              />
              <Icon className="w-[18px] h-[18px]" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer — активный профиль */}
      <div className="px-3 py-3 border-t border-border/40">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg/50 backdrop-blur-lg border border-border gradient-border">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-accent/15 flex items-center justify-center">
            <Gamepad2 className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-text-muted">Профиль</div>
            <div className="text-xs font-medium text-white/90 truncate">
              {active_profile || 'Не выбран'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}