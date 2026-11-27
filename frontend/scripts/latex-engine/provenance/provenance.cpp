
/* Examance (issue #347): the HarfBuzz cluster (first UTF-16 index of the text) of every glyph of the last layout, for provenance.c. */
extern "C" void provGetClusters(void *engine, int32_t *out, int count)
{
    XeTeXLayoutEngine e = (XeTeXLayoutEngine) engine;
    unsigned int n = 0;
    hb_glyph_info_t *infos = hb_buffer_get_glyph_infos(e->hbBuffer, &n);
    for (int i = 0; i < count; i++)
        out[i] = i < (int) n ? (int32_t) infos[i].cluster : -1;
}
