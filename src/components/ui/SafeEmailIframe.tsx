'use client';

import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface SafeEmailIframeProps {
  html: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  autoResize?: boolean;
  maxAutoHeight?: number;
}

function normalizeSafeExternalUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    const protocol = parsed.protocol.toLowerCase();

    // Only allow explicit web links.
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function SafeEmailIframe({
  html,
  className,
  style,
  title = 'email-viewer',
  autoResize = false,
  maxAutoHeight,
}: SafeEmailIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const cleanHtml = useMemo(() => DOMPurify.sanitize(html), [html]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(cleanHtml);
    doc.close();

    // Inject baseline styles before any email-provided styles so the email
    // can still override them, but the default is a clean white/black canvas
    // isolated from the parent app's CSS variables or dark-mode overrides.
    const baseStyle = doc.createElement('style');
    baseStyle.textContent = 'html,body{background:#fff!important;color:#000!important;font-family:sans-serif;font-size:16px;}';
    const head = doc.head ?? doc.documentElement;
    head.insertBefore(baseStyle, head.firstChild);

    const onDocClick = (event: any) => {
      console.log(event);
      const link = event.target?.closest('a');
      console.log(link);
      if (!link) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const href = link.getAttribute('href');
      console.log(href);
      if (!href) return;
      const safeUrl = normalizeSafeExternalUrl(href);
      if (!safeUrl) return;
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
    };

    doc.addEventListener('click', onDocClick);

    if (autoResize) {
      const measuredHeight = doc.documentElement?.scrollHeight;
      if (measuredHeight) {
        const nextHeight = maxAutoHeight
          ? Math.min(measuredHeight + 20, maxAutoHeight)
          : measuredHeight + 20;
        iframe.style.height = `${nextHeight}px`;
      }
    }

    return () => {
      doc.removeEventListener('click', onDocClick);
    };
  }, [cleanHtml, autoResize, maxAutoHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className={cn('w-full border-0', className)}
      style={style}
      title={title}
    />
  );
}
