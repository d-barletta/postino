'use client';

import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:', 'callto:']);

// Static baseline styles injected into every iframe document.
// Defined outside the component so it is never reallocated on re-renders.
const BASE_IFRAME_CSS = [
  // -webkit-text-size-adjust: prevents iOS Safari from auto-scaling small
  // text it considers too small for mobile reading.
  'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}',
  'body{background:#fff;color:#000;}',
].join('');

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
      // Use width=600 as a minimum so emails designed for desktop (typically
      // 600 px wide) render at their intended layout width before being scaled
      // down by `zoom` in applyScaleToFit.  Using `width=device-width` on a
      // narrow iframe causes the email to reflow into a single column with
      // oversized text, which is what makes the inline preview look different
      // from the full-page view.  user-scalable=yes preserves pinch-to-zoom.
      viewport.content = 'width=600, initial-scale=1, user-scalable=yes';
      head.insertBefore(viewport, head.firstChild);
    }

    const base = doc.createElement('base');
    base.target = '_blank';
    head.insertBefore(base, head.firstChild);
    //console.log('[SafeEmailIframe] <base target="_blank"> injected');

    // Inject only a minimal baseline and fit wide content by scaling it down
    // instead of rewriting the email's layout with width overrides.
    const baseStyle = doc.createElement('style');
    baseStyle.textContent = BASE_IFRAME_CSS;
    head.insertBefore(baseStyle, head.firstChild);

    // Appended after email styles so it wins the cascade for same-specificity
    // !important declarations. Some HTML emails set `line-height:100% !important`
    // on body/ExternalClass which makes text look cramped; override with a
    // readable value while leaving higher-specificity rules (e.g. .bodyContent
    // div) untouched.
    const lineHeightFix = doc.createElement('style');
    lineHeightFix.textContent = 'body{line-height:1.5!important;}';
    head.appendChild(lineHeightFix);

    const applyScaleToFit = () => {
      const body = doc.body;
      const root = doc.documentElement;
      if (!body || !root) return;

      // Reset previously applied styles before measuring natural dimensions.
      body.style.zoom = '';
      body.style.transform = '';
      body.style.transformOrigin = '';
      body.style.width = '';
      root.style.overflowX = 'hidden';

      const naturalWidth = Math.max(body.scrollWidth, root.scrollWidth);
      const viewportWidth = iframe.clientWidth;

      if (!naturalWidth || !viewportWidth) return;

      const scale = naturalWidth > viewportWidth ? viewportWidth / naturalWidth : 1;

      // Use `zoom` instead of `transform: scale` so that layout dimensions
      // shrink proportionally — this eliminates the dead whitespace that
      // `transform` leaves below the visible content (transform does not
      // affect layout flow). `zoom` is baseline-available in all modern
      // browsers and has always been supported in Safari/iOS.
      if (scale < 1) {
        body.style.zoom = String(scale);
      }

      if (autoResize) {
        // scrollHeight is now zoom-adjusted; no need to multiply by scale.
        const scaledHeight = Math.max(body.scrollHeight, root.scrollHeight);
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

    // Snapshot the images present at effect-run time. When cleanHtml changes, the
    // cleanup closure holds references to this exact set of nodes so they are
    // properly cleaned up even after the nodes are detached from the document.
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

    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
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
