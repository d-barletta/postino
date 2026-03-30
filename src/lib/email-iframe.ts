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
 *  • A Content-Security-Policy meta tag in the outer wrapper further
 *    restricts what the wrapper document itself may do.
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
    // CSP for the outer wrapper: only inline styles allowed; nothing else.
    '<meta http-equiv="Content-Security-Policy" ' +
    "content=\"default-src 'none'; style-src 'unsafe-inline';\">" +
    '<style>' +
    'html,body{margin:0;padding:0;height:100%;overflow:hidden}' +
    'iframe{width:100%;height:100%;border:0;display:block;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    `<iframe sandbox="" srcdoc="${escaped}"></iframe>` +
    '</body>' +
    '</html>'
  );
}
