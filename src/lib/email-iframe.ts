/**
 * Builds the srcDoc value for a sandboxed email preview iframe using the
 * double-sandbox pattern.
 *
 * Why double-sandbox?
 * The outer React iframe uses sandbox="" (maximum restrictions: no scripts,
 * no same-origin, no forms, no popups, no navigation). Its srcDoc is the
 * wrapper HTML returned by this function — entirely under our control.
 *
 * Inside that wrapper we place a second <iframe sandbox="" srcdoc="…">
 * containing the actual email HTML.  This provides defence-in-depth:
 *
 *  • The email HTML cannot execute JavaScript (inner sandbox="" blocks it).
 *  • Even if a browser bug allowed the outer sandbox to be bypassed, the
 *    inner sandbox still isolates the email content.
 *  • The email content cannot navigate the parent page, submit forms, open
 *    pop-ups, or access the parent origin.
 *
 * Height sizing note
 * The outer React iframe's onLoad handler reads
 * contentDocument.documentElement.scrollHeight to auto-size the preview.
 * The wrapper body carries min-height:600px so that this measurement always
 * returns at least 600px; the onLoad then caps it to 400px via
 * Math.min(height+20, 400).  Without the min-height the wrapper would
 * inherit the iframe's own initial minHeight (200px) and cut off the lower
 * portion of the email — hiding images that appear below ~200px.
 * For fullscreen iframes (flex-1, no onLoad height logic) the wrapper's
 * height:100% on html/body fills the available viewport normally.
 *
 * Usage:
 *   <iframe sandbox="" srcDoc={buildSandboxedEmailSrcDoc(html)} … />
 */
export function buildSandboxedEmailSrcDoc(html: string): string {
  // Escape the email HTML so it can be safely embedded as an HTML attribute
  // value inside the inner <iframe srcdoc="…">.
  // • & must become &amp; first to avoid double-encoding other sequences.
  // • " must become &quot; to avoid breaking the surrounding attribute.
  // • < and > are escaped for defence against parser quirks in older browsers.
  //   The browser HTML-decodes them back to < / > when processing srcDoc, so
  //   the inner iframe still receives the original email markup correctly.
  const escaped = html
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return (
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<style>' +
    // min-height:600px ensures the onLoad height measurement always returns
    // a value that gets capped to the 400px max, rather than inheriting the
    // outer iframe's initial minHeight (~200px) which would cut off images.
    // height:100% kicks in for fullscreen usage (flex-1 outer iframe) where
    // the viewport is larger than 600px, filling the available space.
    'html,body{margin:0;padding:0;height:100%;min-height:600px;overflow:hidden}' +
    'iframe{width:100%;height:100%;border:0;display:block;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    `<iframe sandbox="" srcdoc="${escaped}"></iframe>` +
    '</body>' +
    '</html>'
  );
}
