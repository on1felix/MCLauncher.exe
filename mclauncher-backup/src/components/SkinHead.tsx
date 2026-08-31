import { useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { api } from '../api';

interface SkinHeadProps {
  nick: string;
  size: number;
  className?: string;
}

export function SkinHead({ nick, size, className = '' }: SkinHeadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!nick.trim()) {
      setFailed(true);
      return;
    }
    api.fetchSkin(nick).then((info) => {
      if (cancelled) return;
      if (!info) {
        setFailed(true);
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
        try {
          const probe = document.createElement('canvas');
          probe.width = 8;
          probe.height = 8;
          const pctx = probe.getContext('2d');
          if (!pctx) return;
          pctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
          const px = pctx.getImageData(0, 0, 8, 8).data;
          let hasOverlay = false;
          for (let i = 3; i < px.length; i += 4) {
            if (px[i] > 0) {
              hasOverlay = true;
              break;
            }
          }
          if (hasOverlay) ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
        } catch {
          // data URL — ошибок CORS не будет
        }
      };
      img.onerror = () => {
        if (!cancelled) setFailed(true);
      };
      img.src = info.url;
    });
    return () => {
      cancelled = true;
    };
  }, [nick, size]);

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded bg-bg-2/60 border border-border ${className}`}
      >
        <User className="w-1/2 h-1/2 text-text-muted" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={`rounded ${className}`}
    />
  );
}