/**
 * Turns a blocked inline script into an actionable console message. The raw
 * browser error reads like a CORS or build failure; on this project it has
 * always been a Cloudflare dashboard feature rewriting the HTML after the build
 * hashed it. See docs/deployment.md, "Cloudflare dashboard settings".
 *
 * Never "fix" it by allowing the injector's host in `script-src`: that sends
 * visitor data to a third party (docs/data_flow_and_security.md).
 */

const EDGE_INJECTORS: [RegExp, string][] = [
  [/cloudflareinsights|beacon\.min\.js/i, 'Cloudflare Web Analytics'],
  [/rocket-loader|rocketscript/i, 'Cloudflare Rocket Loader'],
  [/email-decode/i, 'Cloudflare Email Obfuscation'],
];

let registered = false;

export function registerCspDiagnostics(): void {
  if (registered || typeof document === 'undefined') return;
  registered = true;

  const onViolation = (event: SecurityPolicyViolationEvent) => {
    if (!event.violatedDirective.startsWith('script-src')) return;
    document.removeEventListener('securitypolicyviolation', onViolation);

    const source = `${event.blockedURI} ${event.sourceFile ?? ''}`;
    const feature =
      EDGE_INJECTORS.find(([match]) => match.test(source))?.[1] ??
      'a Cloudflare dashboard feature (Web Analytics, Rocket Loader, Email Obfuscation)';
    console.warn(
      `[CSP] A script the build never saw was blocked — not a CORS error, not a build failure. ` +
        `Likely ${feature} injecting it at the edge: turn it off in the Cloudflare dashboard, ` +
        `do not widen script-src. See docs/deployment.md, "Cloudflare dashboard settings".`,
      { blocked: event.blockedURI || '(inline)', sourceFile: event.sourceFile, line: event.lineNumber }
    );
  };
  document.addEventListener('securitypolicyviolation', onViolation);
}
