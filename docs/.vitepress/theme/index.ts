import DefaultTheme from 'vitepress/theme';
import { inBrowser, useData, useRoute, useRouter, withBase } from 'vitepress';
import mediumZoom, { type Zoom } from 'medium-zoom';
import { nextTick, onMounted, watch } from 'vue';
import './custom.css';

const LANG_KEY = 'examance-docs-lang';

function readLanguage(): string | null {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}

function storeLanguage(lang: string): void {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage may be blocked */ }
}

/** German is the default: a first visit to the bare root goes to /de/ unless English was chosen before. */
function startInGerman(path: string, base: string, go: (to: string) => Promise<void>): void {
  if (!inBrowser || path !== base) return;
  if (readLanguage() !== 'en') void go(withBase('/de/'));
}

function rememberLanguage(path: string, previous: string | undefined, base: string): void {
  if (path.startsWith(`${base}de/`)) storeLanguage('de');
  else if (path !== base || previous?.startsWith(`${base}de/`)) storeLanguage('en');
}

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute();
    const router = useRouter();
    const { site } = useData();
    startInGerman(route.path, site.value.base, router.go);
    // Leaving a German page for the English root is the language menu: remember English so the root stops redirecting.
    watch(() => route.path, (path, previous) => rememberLanguage(path, previous, site.value.base));
    let zoom: Zoom | undefined;
    // Screenshots open full size on click; re-attached after every client-side navigation (images inside links keep their link).
    const attach = () => nextTick(() => {
      zoom ??= mediumZoom({ background: 'var(--vp-c-bg)', margin: 24 });
      zoom.detach();
      zoom.attach('.vp-doc img:not(a img)');
    });
    onMounted(attach);
    watch(() => route.path, attach);
  },
};
