/**
 * Explains a Content-Security-Policy violation instead of leaving the raw
 * browser error to be misread.
 *
 * The error this exists for is:
 *
 *     Executing inline script violates the following Content Security Policy
 *     directive 'script-src 'self' 'wasm-unsafe-eval' 'sha256-…''
 *
 * It looks like a CORS failure or a broken build, and has been reported as
 * both. It is neither. `scripts/generate-csp-headers.mjs` derives the hash of
 * every inline script from the build output, and `npm run csp:verify` fails the
 * build if one is missing — so a script the policy does not know about was
 * injected *after* the build, on the Cloudflare edge.
 *
 * The usual culprit is Cloudflare Web Analytics, which inserts an inline
 * snippet plus a beacon script into the served HTML. See docs/deployment.md,
 * "Cloudflare dashboard settings". The fix is a dashboard toggle.
 *
 * Do NOT "fix" this by adding the beacon host to `script-src`: that starts
 * sending visitor data to a third party, which contradicts the
 * no-third-party-transfer claims in docs/data_flow_and_security.md and on the
 * legal pages.
 */

const KNOWN_EDGE_INJECTORS: { match: RegExp; feature: string }[] = [
  { match: /cloudflareinsights|beacon\.min\.js/i, feature: 'Cloudflare Web Analytics' },
  { match: /rocket-loader|rocketscript/i, feature: 'Cloudflare Rocket Loader' },
  { match: /email-decode/i, feature: 'Cloudflare Email Obfuscation' },
];

/** Reported once per page load; one violation usually fires repeatedly. */
let reported = false;

function describe(event: SecurityPolicyViolationEvent): string {
  const source = `${event.blockedURI} ${event.sourceFile ?? ''}`;
  const known = KNOWN_EDGE_INJECTORS.find((entry) => entry.match.test(source));

  if (known) {
    return (
      `[CSP] ${known.feature} is injecting script into this page after the build, ` +
      `so its hash is not in the policy. Turn the feature off in the Cloudflare ` +
      `dashboard — do not add its host to script-src, which would send visitor ` +
      `data to a third party. See docs/deployment.md, "Cloudflare dashboard settings".`
    );
  }

  return (
    `[CSP] An inline script was blocked that the build never saw. This is not a ` +
    `CORS error and not a build failure: the policy's hashes are derived from ` +
    `the build output and verified by "npm run csp:verify". Something is ` +
    `rewriting the HTML after deployment — on this project that has always been ` +
    `a Cloudflare dashboard feature (Web Analytics, Rocket Loader, Email ` +
    `Obfuscation). See docs/deployment.md, "Cloudflare dashboard settings".`
  );
}

/** Registers the listener. Safe to call more than once. */
export function registerCspDiagnostics(): void {
  if (typeof document === 'undefined') return;

  document.addEventListener('securitypolicyviolation', (event) => {
    const violation = event as SecurityPolicyViolationEvent;
    // Only script-src: a blocked image or font is a different conversation.
    if (!violation.violatedDirective.startsWith('script-src')) return;
    if (reported) return;
    reported = true;

    console.warn(describe(violation));
    console.warn('[CSP] Blocked:', violation.blockedURI || '(inline)', {
      directive: violation.violatedDirective,
      sourceFile: violation.sourceFile,
      line: violation.lineNumber,
    });
  });
}
