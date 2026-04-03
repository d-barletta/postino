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

    // Inject baseline styles: white background and black text isolated from
    // the parent app's CSS variables and dark-mode overrides.
    const baseStyle = doc.createElement('style');
    baseStyle.textContent = [
      // -webkit-text-size-adjust: prevents iOS Safari from auto-scaling small
      // text it considers too small for mobile reading.
      'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}',
      // Base canvas
      'body{background:#fff!important;color:#000!important;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;margin:0;padding:8px;}',
      // Constrain everything — fixed-pixel widths (e.g. width="600" HTML attrs) won't overflow
      '*{max-width:100%!important;box-sizing:border-box!important;word-wrap:break-word;}',
      // Tables: most email layout is table-based.
      // border-spacing:0 removes default cell gaps; min-width:0 lets cells shrink.
      'table{width:100%!important;table-layout:fixed!important;border-collapse:collapse;border-spacing:0;}',
      // color/font-size:inherit so body defaults cascade through table cells
      'td,th{word-break:break-word;vertical-align:top;padding:2px;min-width:0;color:inherit;font-size:inherit;}',
      // Images: block removes inline gap below images common in table layouts
      'img{display:block;height:auto!important;border:0;max-width:100%!important;}',
      // Links: standard blue/visited colors
      'a{color:#1a0dab;word-break:break-all;}',
      'a:visited{color:#681da8;}',
      // HTML align attributes used heavily in email HTML
      '[align="center"]{text-align:center;}',
      '[align="left"]{text-align:left;}',
      '[align="right"]{text-align:right;}',
      // Dividers
      'hr{border:none;border-top:1px solid #e0e0e0;margin:8px 0;}',
      // Blockquotes (reply threads)
      'blockquote{margin:8px 0 8px 16px;padding-left:12px;border-left:3px solid #ccc;color:#555;}',
      // Preformatted / code
      'pre,code{font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;background:#f5f5f5;padding:2px 4px;border-radius:3px;}',
      // Headings reset (emails set their own sizes; avoids webapp h* overrides)
      'h1,h2,h3,h4,h5,h6{font-weight:bold;margin:8px 0;}',
      'h1{font-size:2em;}h2{font-size:1.5em;}h3{font-size:1.17em;}',
      // Lists
      'ul,ol{padding-left:24px;margin:8px 0;}',
      'li{margin:4px 0;}',
      // Paragraphs
      'p{margin:8px 0;}',
      // Prevent illegibly tiny text while letting inline styles still override upward
      '*{font-size:max(11px,1em);}',
      // span/div/font are used heavily in email HTML for inline styling;
      // ensure color cascades from body through them
      'span,div,font{color:inherit;}',

      // --- Apple Mail / native client fidelity ---

      // Use the same system font stack Apple Mail uses on macOS/iOS.
      // -apple-system picks SF Pro on Apple platforms; Segoe UI on Windows.
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif!important;}',

      // Quoted reply blocks: Apple Mail indents with a blue left border.
      // Nested quotes get progressively darker/narrower borders.
      'blockquote{border-left:2px solid #aac3e0;padding-left:10px;margin:4px 0 4px 8px;color:#444;}',
      'blockquote blockquote{border-left-color:#7aa3c0;}',
      'blockquote blockquote blockquote{border-left-color:#4a7fa0;}',

      // Apple Mail renders the "wrote:" attribution line in a muted grey.
      '.gmail_quote,.apple_quoted_label,.moz-cite-prefix{color:#666;font-size:0.9em;}',

      // Signature delimiter: most clients render "-- \n" as a faint separator.
      '.gmail_signature,.apple_signature{color:#888;border-top:1px solid #e0e0e0;margin-top:12px;padding-top:6px;font-size:0.9em;}',

      // Definition lists used in some transactional email templates
      'dl{margin:8px 0;}',
      'dt{font-weight:bold;}',
      'dd{margin:0 0 4px 16px;}',

      // Button-style links common in marketing/transactional emails:
      // preserve their inline-block shape but cap width so they stay readable.
      'a[style*="display:inline-block"],a[style*="display: inline-block"],' +
        'td[style*="border-radius"],th[style*="border-radius"]{display:inline-block;overflow:hidden;}',

      // Outlook conditional comments leave empty divs with specific classes;
      // collapse them so they don't create unwanted whitespace.
      '.ExternalClass,.ExternalClass p,.ExternalClass span,' +
        '.ExternalClass font,.ExternalClass td,.ExternalClass div{line-height:100%;}',

      // Selection highlight: match macOS blue
      '::selection{background:#b3d4f5;color:#000;}',
    ].join('');
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
