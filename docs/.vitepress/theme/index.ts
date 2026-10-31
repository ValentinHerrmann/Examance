import DefaultTheme from 'vitepress/theme';
import { useRoute } from 'vitepress';
import mediumZoom, { type Zoom } from 'medium-zoom';
import { nextTick, onMounted, watch } from 'vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute();
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
