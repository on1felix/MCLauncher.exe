import { Fragment, type ReactNode } from 'react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';

export function openExternal(url: string) {
  void shellOpen(url).catch(() => {});
}

type Tok =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'img'; alt: string; url: string }
  | { t: 'link'; label: string; url: string }
  | { t: 'linkimg'; alt: string; img: string; url: string }
  | { t: 'b'; v: string }
  | { t: 'i'; v: string }
  | { t: 's'; v: string }
  | { t: 'u'; v: string };

// Приводим HTML-описания Modrinth к markdown
function normalize(src: string): string {
  let s = src.replace(/\r\n/g, '\n');

  s = s.replace(/<img\s[^>]*?src=["']([^"']+)["'][^>]*\/?>/gi, (_m, u) => `\n\n![](${u})\n\n`);
  s = s.replace(/<a\s[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, u: string, inner: string) => `[${inner.replace(/^\s+|\s+$/g, '')}](${u.trim()})`);

  s = s.replace(/<h([1-6])[^>]*>/gi, (_m, n: string) => `\n\n${'#'.repeat(+n)} `);
  s = s.replace(/<\/h[1-6]>/gi, '\n\n');

  s = s.replace(/<pre[^>]*>\s*(?:<code[^>]*>)?([\s\S]*?)<\/code>\s*<\/pre>/gi, (_m, c: string) => `\n\n\`\`\`\n${c}\n\`\`\`\n\n`);
  s = s.replace(/<code[^>]*>/gi, '`').replace(/<\/code>/gi, '`');

  s = s.replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(ul|ol)>/gi, '\n\n');
  s = s.replace(/<(ul|ol)[^>]*>/gi, '\n');

  s = s.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
  s = s.replace(/<blockquote[^>]*>/gi, '\n\n> ').replace(/<\/blockquote>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');

  s = s.replace(/<u[^>]*>/gi, '++').replace(/<\/u>/gi, '++');
  s = s.replace(/<(strong|b)(\s[^>]*)?>/gi, '**').replace(/<\/(strong|b)>/gi, '**');
  s = s.replace(/<(em|i)(\s[^>]*)?>/gi, '*').replace(/<\/(em|i)>/gi, '*');

  s = s.replace(/<\/?(p|center|div|span|sub|sup|small|font|figure|figcaption|details|summary|table|tbody|thead|tr|td|th|video|source)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');

  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&(laquo|raquo);/gi, (_m, w: string) => (w === 'laquo' ? '«' : '»'));

  return s.replace(/\n{3,}/g, '\n\n');
}

const tokRe =
  /(`[^`\n]+`)|(\[!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)\]\([^)\s]+(?:\s+"[^"]*")?\))|(!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\))|(\[[^\]\n]+\]\([^)\s]+(?:\s+"[^"]*")?\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\+\+[^+\n]+\+\+)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

function parseInline(src: string): Tok[] {
  const toks: Tok[] = [];
  let last = 0;
  for (const m of src.matchAll(tokRe)) {
    const idx = m.index ?? 0;
    if (idx > last) toks.push({ t: 'text', v: src.slice(last, idx) });
    const s = m[0];
    if (s.startsWith('`')) {
      toks.push({ t: 'code', v: s.slice(1, -1) });
    } else if (s.startsWith('[![')) {
      const lm = /^\[!\[([^\]]*)\]\(([^)\s]+)/.exec(s)!;
      const outer = /\]\(([^)\s]+)\)$/.exec(s)!;
      toks.push({ t: 'linkimg', alt: lm[1], img: lm[2], url: outer[1] });
    } else if (s.startsWith('![')) {
      const im = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(s)!;
      toks.push({ t: 'img', alt: im[1], url: im[2] });
    } else if (s.startsWith('[')) {
      const lm = /^\[([^\]\n]+)\]\(([^)\s]+)/.exec(s)!;
      toks.push({ t: 'link', label: lm[1], url: lm[2] });
    } else if (s.startsWith('**') || s.startsWith('__')) {
      toks.push({ t: 'b', v: s.slice(2, -2) });
    } else if (s.startsWith('~~')) {
      toks.push({ t: 's', v: s.slice(2, -2) });
    } else if (s.startsWith('++')) {
      toks.push({ t: 'u', v: s.slice(2, -2) });
    } else {
      toks.push({ t: 'i', v: s.slice(1, -1) });
    }
    last = idx + s.length;
  }
  if (last < src.length) toks.push({ t: 'text', v: src.slice(last) });
  return toks;
}

const resolveUrl = (u: string, baseUrl?: string): string => {
  let url = u;
  if (url.startsWith('/')) url = `https://modrinth.com${url}`;
  else if (!/^https?:\/\//i.test(url) && baseUrl) url = `${baseUrl.replace(/\/+$/, '')}/${url}`;
  return url;
};

function renderInline(src: string, kp: string, base?: string): ReactNode[] {
  return parseInline(src).map((tk, i) => {
    const k = `${kp}-${i}`;
    switch (tk.t) {
      case 'code':
        return (
          <code key={k} className="px-1 py-0.5 rounded bg-bg-3 border border-border font-mono text-[11px] text-accent/90">
            {tk.v}
          </code>
        );
      case 'img':
        return (
          <img
            key={k}
            src={resolveUrl(tk.url, base)}
            alt={tk.alt}
            loading="lazy"
            draggable={false}
            className="inline-block max-w-full rounded-lg border border-border my-1.5 align-middle"
          />
        );
      case 'linkimg': {
        const url = resolveUrl(tk.url, base);
        return (
          <a
            key={k}
            href={url}
            onClick={(e) => {
              e.preventDefault();
              openExternal(url);
            }}
            className="inline-block cursor-pointer"
          >
            <img
              src={resolveUrl(tk.img, base)}
              alt={tk.alt}
              loading="lazy"
              draggable={false}
              className="inline-block max-w-full rounded-lg border border-border my-1.5 align-middle hover:border-accent/50 transition-colors"
            />
          </a>
        );
      }
      case 'link': {
        const url = resolveUrl(tk.url, base);
        return (
          <a
            key={k}
            href={url}
            onClick={(e) => {
              e.preventDefault();
              openExternal(url);
            }}
            className="text-accent underline-offset-2 hover:underline cursor-pointer break-all"
          >
            {renderInline(tk.label, k, base)}
          </a>
        );
      }
      case 'b':
        return (
          <strong key={k} className="font-semibold text-white/90">
            {renderInline(tk.v, k, base)}
          </strong>
        );
      case 'i':
        return (
          <em key={k}>{renderInline(tk.v, k, base)}</em>
        );
      case 's':
        return (
          <del key={k} className="opacity-70">
            {renderInline(tk.v, k, base)}
          </del>
        );
      case 'u':
        return (
          <span key={k} className="underline underline-offset-2">
            {renderInline(tk.v, k, base)}
          </span>
        );
      default:
        return <Fragment key={k}>{tk.v}</Fragment>;
    }
  });
}

const H_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const IMG_ONLY_RE = /^\s*(\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)|!\[[^\]]*\]\([^)]*\))\s*$/;
const TBL_ROW = /^\s*\|.*\|\s*$/;
const TBL_SEP = /^\s*\|[\s:|-]+\|\s*$/;

function renderBlocks(src: string, kp: string, base?: string): ReactNode[] {
  const lines = src.split('\n');
  const out: ReactNode[] = [];
  let n = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(
        <pre
          key={`${kp}-b${n++}`}
          className="my-2 p-3 rounded-lg bg-bg-3 border border-border overflow-x-auto"
        >
          <code className="font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre">{buf.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const h = H_RE.exec(line);
    if (h) {
      const lvl = h[1].length;
      const size = lvl <= 2 ? 'text-sm' : 'text-xs';
      out.push(
        <div key={`${kp}-b${n++}`} className={`${size} ${lvl <= 2 ? 'font-bold' : 'font-semibold'} text-white/90 mt-3 mb-1.5 [&:first-child]:mt-0`}>
          {renderInline(h[2].replace(/#+\s*$/, ''), `${kp}-b${n}`, base)}
        </div>
      );
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push(<hr key={`${kp}-b${n++}`} className="my-3 border-border" />);
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(
        <blockquote
          key={`${kp}-b${n++}`}
          className="my-2 pl-3 border-l-2 border-accent/50 italic space-y-1.5"
        >
          {renderBlocks(buf.join('\n'), `${kp}-b${n}`, base)}
        </blockquote>
      );
      continue;
    }

    if (IMG_ONLY_RE.test(line)) {
      const tk = parseInline(line.trim())[0];
      if (tk && (tk.t === 'img' || tk.t === 'linkimg')) {
        if (tk.t === 'linkimg') {
          const url = resolveUrl(tk.url, base);
          out.push(
            <a
              key={`${kp}-b${n++}`}
              href={url}
              onClick={(e) => {
                e.preventDefault();
                openExternal(url);
              }}
              className="block cursor-pointer"
            >
              <img
                src={resolveUrl(tk.img, base)}
                alt={tk.alt}
                loading="lazy"
                draggable={false}
                className="block max-w-full w-auto rounded-lg border border-border my-2 mx-auto hover:border-accent/50 transition-colors"
              />
            </a>
          );
        } else {
          out.push(
            <img
              key={`${kp}-b${n++}`}
              src={resolveUrl(tk.url, base)}
              alt={tk.alt}
              loading="lazy"
              draggable={false}
              className="block max-w-full w-auto rounded-lg border border-border my-2 mx-auto"
            />
          );
        }
        i++;
        continue;
      }
    }

    if (TBL_ROW.test(line) && i + 1 < lines.length && TBL_SEP.test(lines[i + 1])) {
      const splitRow = (r: string) =>
        r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TBL_ROW.test(lines[i])) rows.push(splitRow(lines[i++]));
      out.push(
        <div key={`${kp}-b${n++}`} className="my-2 overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci} className="border border-border bg-bg-3 px-2 py-1 text-left font-semibold text-white/90">
                    {renderInline(c, `${kp}-b${n}-${ci}`, base)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-border px-2 py-1">
                      {renderInline(c, `${kp}-b${n}-${ri}-${ci}`, base)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const ul = UL_RE.exec(line);
    const ol = OL_RE.exec(line);
    if (ul || ol) {
      const ordered = !!ol && (!ul || line.match(OL_RE) !== null);
      const items: string[] = [];
      while (i < lines.length) {
        const mu = UL_RE.exec(lines[i]);
        const mo = OL_RE.exec(lines[i]);
        const mm = ordered ? mo : mu;
        if (mm) items.push(ordered ? mo![3] : mu![2]);
        else if (/^\s{2,}\S/.test(lines[i]) && items.length > 0) items[items.length - 1] += '\n' + lines[i].trim();
        else break;
        i++;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      out.push(
        <ListTag
          key={`${kp}-b${n++}`}
          className={`my-2 pl-4 space-y-1 marker:text-accent/70 ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((it, ii) => (
            <li key={ii} className="leading-relaxed whitespace-pre-line [&>img]:mx-auto">
              {renderInline(it, `${kp}-b${n}-${ii}`, base)}
            </li>
          ))}
        </ListTag>
      );
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !H_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i]) &&
      !IMG_ONLY_RE.test(lines[i]) &&
      !TBL_ROW.test(lines[i]) &&
      !/^\s*(```|>)/.test(lines[i])
    )
      buf.push(lines[i++]);
    out.push(
      <p key={`${kp}-b${n++}`} className="my-2 leading-relaxed [&:first-child]:mt-0 [&:last-child]:mb-0">
        {renderInline(buf.join('\n'), `${kp}-b${n}`, base)}
      </p>
    );
  }

  return out;
}

export default function Md({ source, baseUrl }: { source: string; baseUrl?: string }) {
  const clean = normalize(source);
  if (!clean.trim()) return null;
  return (
    <div className="text-xs text-text-secondary [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {renderBlocks(clean, 'md', baseUrl)}
    </div>
  );
}
