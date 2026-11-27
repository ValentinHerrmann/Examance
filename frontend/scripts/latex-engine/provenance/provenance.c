
/* Examance (issue #347): the source origin of every token node, parallel to mem (see provenance.ch). */
int32_t provcur = 0;
int32_t *provmem = NULL;
static int32_t *provbase = NULL;

void provalloc(int lo, int hi)
{
    free(provbase);
    provbase = (int32_t *) xcalloc((size_t) (hi - lo + 1), sizeof(int32_t));
    provmem = provbase - lo;
}

/* One line of main.prov per native word shipped out: page, h, v, width, font size (sp), glyph count and each glyph's x offset (sp, as written to the XDV). */
static FILE *provfile = NULL;

void provWord(void *pNode, int h, int v, int page, int size)
{
    memoryword *p = (memoryword *) pNode;
    int n = native_glyph_count(p);
    FixedPoint *loc = (FixedPoint *) native_glyph_info_ptr(p);
    int i;
    if (provfile == NULL) {
        provfile = fopen("main.prov", "w");
        if (provfile == NULL)
            return;
        setvbuf(provfile, NULL, _IOLBF, 0);
    }
    fprintf(provfile, "w %d %d %d %d %d %d", page, h, v, (int) node_width(p), size, loc ? n : 0);
    for (i = 0; loc && i < n; i++)
        fprintf(provfile, " %d", (int) loc[i].x);
    fputc('\n', provfile);
}
