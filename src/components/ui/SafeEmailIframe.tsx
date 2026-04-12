'use client';

import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:', 'callto:']);

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

    if (!ALLOWED_PROTOCOLS.has(protocol)) {
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

    const parsed = new DOMParser().parseFromString(cleanHtml, 'text/html');
    doc.documentElement.innerHTML = parsed.documentElement.innerHTML;

    const head = doc.head ?? doc.documentElement;
    if (!head) {
      console.error('[SafeEmailIframe] could not find head/documentElement');
      return;
    }

    // Inject <base target="_blank"> first so every link opens in a new tab
    // natively. This is the only approach that works on iOS Safari, which
    // blocks programmatic window.open() calls from iframe event handlers.
    // Viewport meta: prevents iOS from zooming/scaling email content as if it
    // were a desktop page. Without this, iOS auto-scales small text up.
    if (!doc.querySelector('meta[name="viewport"]')) {
      const viewport = doc.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1';
      head.insertBefore(viewport, head.firstChild);
    }

    const base = doc.createElement('base');
    base.target = '_blank';
    head.insertBefore(base, head.firstChild);
    //console.log('[SafeEmailIframe] <base target="_blank"> injected');

    // Inject only a minimal baseline and fit wide content by scaling it down
    // instead of rewriting the email's layout with width overrides.
    const baseStyle = doc.createElement('style');
    baseStyle.textContent = [
      // -webkit-text-size-adjust: prevents iOS Safari from auto-scaling small
      // text it considers too small for mobile reading.
      'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}',
      'body{background:#fff;color:#000;}',
    ].join('');
    head.insertBefore(baseStyle, head.firstChild);

    const applyScaleToFit = () => {
      const body = doc.body;
      const root = doc.documentElement;
      if (!body || !root) return;

      body.style.transform = '';
      body.style.transformOrigin = '';
      body.style.width = '';
      root.style.overflowX = 'hidden';

      const naturalWidth = Math.max(body.scrollWidth, root.scrollWidth);
      const viewportWidth = iframe.clientWidth;

      if (!naturalWidth || !viewportWidth) return;

      const scale = naturalWidth > viewportWidth ? viewportWidth / naturalWidth : 1;
      if (scale < 1) {
        body.style.width = `${naturalWidth}px`;
        body.style.transformOrigin = 'top left';
        body.style.transform = `scale(${scale})`;
      }

      if (autoResize) {
        const naturalHeight = Math.max(body.scrollHeight, root.scrollHeight);
        const scaledHeight = scale < 1 ? naturalHeight * scale : naturalHeight;
        const nextHeight = maxAutoHeight
          ? Math.min(scaledHeight + 20, maxAutoHeight)
          : scaledHeight + 20;
        iframe.style.height = `${nextHeight}px`;
      }
    };

    // Block any link whose protocol is not http/https (e.g. javascript:, data:).
    // Valid http/https links are handled natively by the <base target="_blank">.
    const onDocClick = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest('a');
      if (!link) {
        console.warn('[SafeEmailIframe] click: no <a> found near target');
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

    const images = Array.from(doc.images);
    const onContentLoad = () => {
      applyScaleToFit();
    };
    for (const image of images) {
      image.addEventListener('load', onContentLoad);
      image.addEventListener('error', onContentLoad);
    }

    const resizeObserver = new ResizeObserver(() => {
      applyScaleToFit();
    });
    resizeObserver.observe(iframe);

    requestAnimationFrame(() => {
      applyScaleToFit();
    });

    return () => {
      doc.removeEventListener('click', onDocClick);
      for (const image of images) {
        image.removeEventListener('load', onContentLoad);
        image.removeEventListener('error', onContentLoad);
      }
      resizeObserver.disconnect();
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
