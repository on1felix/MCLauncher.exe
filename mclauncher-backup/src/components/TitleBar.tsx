import { Minus, X, Square } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    appWindow.startDragging();
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-10 flex items-center justify-between px-4 bg-bg/50 border-b border-border select-none shrink-0"
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <img src="/app-icon.png" alt="" className="w-5 h-5 rounded" />
        <span className="text-sm font-medium text-text-2"
          style={{ fontFamily: "'PauzaStencil', 'Onest', sans-serif" }}>
          MC<span className="text-accent">Launcher</span>
        </span>
        {version && (
          <span className="text-[10px] font-semibold text-text-muted/70 px-1.5 py-[1px] rounded border border-border/60 bg-white/[0.03]">
            v{version}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => appWindow.minimize()}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          >
            <Minus className="w-4 h-4 text-text-secondary" />
          </button>
          <button
            onClick={() => appWindow.toggleMaximize()}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          >
            <Square className="w-3.5 h-3.5 text-text-secondary" />
          </button>
          <button
            onClick={() => appWindow.close()}
            className="group w-8 h-8 flex items-center justify-center rounded transition-colors duration-200 hover:bg-danger/30"
          >
            <X className="w-4 h-4 text-text-secondary transition-colors duration-200 group-hover:text-[#ff6666]" />
          </button>
        </div>
      </div>
    </div>
  );
}
