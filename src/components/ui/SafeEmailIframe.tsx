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
    if (!iframe) {
      console.error('[SafeEmailIframe] iframe ref is null');
      return;
    }
    const doc = iframe.contentDocument;
    if (!doc) {
      console.error('[SafeEmailIframe] contentDocument is null');
      return;
    }

    doc.open();
    doc.write(cleanHtml);
    doc.close();

    const head = doc.head ?? doc.documentElement;
    if (!head) {
      console.error('[SafeEmailIframe] could not find head/documentElement');
      return;
    }

    // Inject <base target="_blank"> first so every link opens in a new tab
    // natively. This is the only approach that works on iOS Safari, which
    // blocks programmatic window.open() calls from iframe event handlers.
    const base = doc.createElement('base');
    base.target = '_blank';
    head.insertBefore(base, head.firstChild);
    //console.log('[SafeEmailIframe] <base target="_blank"> injected');

    // Inject baseline styles: white background and black text isolated from
    // the parent app's CSS variables and dark-mode overrides.
    const baseStyle = doc.createElement('style');
    baseStyle.textContent =
      'html,body{background:#fff!important;color:#000!important;font-family:sans-serif;font-size:16px;}';
    head.insertBefore(baseStyle, head.firstChild);

    // Block any link whose protocol is not http/https (e.g. javascript:, data:).
    // Valid http/https links are handled natively by the <base target="_blank">.
    const onDocClick = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest('a');
      if (!link) {
        console.error('[SafeEmailIframe] click: no <a> found near target');
        return;
      }
      const href = link.getAttribute('href');
      if (!href) {
        console.error('[SafeEmailIframe] click: <a> has no href');
        return;
      }
      const safeUrl = normalizeSafeExternalUrl(href);
      if (!safeUrl) {
        console.error(`[SafeEmailIframe] click: blocked unsafe href="${href}"`);
        event.preventDefault();
        return;
      }
      //console.log(`[SafeEmailIframe] click: allowing href="${safeUrl}" — browser will open it`);
    };

    doc.addEventListener('click', onDocClick);
    //console.log('[SafeEmailIframe] click listener attached');

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
      sandbox="allow-same-origin allow-popups"
      className={cn('w-full border-0', className)}
      style={style}
      title={title}
    />
  );
}
