
/* Examance (issue #347): the source origin of every token node, parallel to mem, and of every character of a native word node (see provenance.ch). */
int32_t provcur = 0;
int32_t *provmem = NULL;
static int32_t *provbase = NULL;

void provalloc(int lo, int hi)
{
    free(provbase);
    provbase = (int32_t *) xcalloc((size_t) (hi - lo + 1), sizeof(int32_t));
    provmem = provbase - lo;
}

/* Origins of the characters collected in native_text, index for index. */
static int32_t *provbuf = NULL;
static int provbufsize = 0;

static void provbufroom(int k)
{
    if (k < provbufsize)
        return;
    int size = provbufsize ? provbufsize : 256;
    while (size <= k)
        size *= 2;
    provbuf = (int32_t *) xrealloc(provbuf, (size_t) size * sizeof(int32_t));
    memset(provbuf + provbufsize, 0, (size_t) (size - provbufsize) * sizeof(int32_t));
    provbufsize = size;
}

void provbufset(int k, int v)
{
    if (k < 0)
        return;
    provbufroom(k);
    provbuf[k] = v;
}

static int provbufget(int k)
{
    return k >= 0 && k < provbufsize ? provbuf[k] : 0;
}

void provbufcopy(int k, int from)
{
    provbufset(k, provbufget(from));
}

/* One entry per live native word node, keyed by its mem index: each character's origin and, after shaping, each glyph's cluster. */
typedef struct {
    int32_t key;
    int32_t n;
    int32_t *pos;
    int32_t ng;
    int32_t *clu;
} ProvNode;

#define PROV_EMPTY INT32_MIN
#define PROV_GONE (INT32_MIN + 1)
static ProvNode *provtab = NULL;
static int provcap = 0;
static int provfill = 0;

static unsigned provhash(int32_t key)
{
    return ((uint32_t) key * 2654435761u);
}

static ProvNode *provfind(int32_t key)
{
    if (!provcap)
        return NULL;
    unsigned mask = (unsigned) provcap - 1;
    for (unsigned i = provhash(key) & mask, k = 0; k < (unsigned) provcap; i = (i + 1) & mask, k++) {
        if (provtab[i].key == key)
            return &provtab[i];
        if (provtab[i].key == PROV_EMPTY)
            return NULL;
    }
    return NULL;
}

static void provgrow(void);

static ProvNode *provinsert(int32_t key)
{
    ProvNode *e = provfind(key);
    if (e)
        return e;
    if ((provfill + 1) * 2 > provcap)
        provgrow();
    unsigned mask = (unsigned) provcap - 1;
    unsigned i = provhash(key) & mask;
    while (provtab[i].key != PROV_EMPTY && provtab[i].key != PROV_GONE)
        i = (i + 1) & mask;
    if (provtab[i].key == PROV_EMPTY)
        provfill++;
    provtab[i].key = key;
    provtab[i].n = 0;
    provtab[i].pos = NULL;
    provtab[i].ng = 0;
    provtab[i].clu = NULL;
    return &provtab[i];
}

static void provgrow(void)
{
    ProvNode *old = provtab;
    int oldcap = provcap;
    provcap = provcap ? provcap * 2 : 4096;
    provtab = (ProvNode *) xmalloc((size_t) provcap * sizeof(ProvNode));
    for (int i = 0; i < provcap; i++)
        provtab[i].key = PROV_EMPTY;
    provfill = 0;
    for (int i = 0; i < oldcap; i++) {
        if (old[i].key == PROV_EMPTY || old[i].key == PROV_GONE)
            continue;
        ProvNode *e = provinsert(old[i].key);
        *e = old[i];
    }
    free(old);
}

void provnodenew(int p, int n)
{
    ProvNode *e = provinsert(p);
    e->pos = (int32_t *) xrealloc(e->pos, (size_t) (n > 0 ? n : 1) * sizeof(int32_t));
    memset(e->pos, 0, (size_t) (n > 0 ? n : 1) * sizeof(int32_t));
    e->n = n;
    free(e->clu);
    e->clu = NULL;
    e->ng = 0;
}

void provnodefree(int p)
{
    ProvNode *e = provfind(p);
    if (!e)
        return;
    free(e->pos);
    free(e->clu);
    e->key = PROV_GONE;
    e->pos = NULL;
    e->clu = NULL;
}

static int provnodeget(int q, int j)
{
    ProvNode *e = provfind(q);
    return e && j >= 0 && j < e->n ? e->pos[j] : 0;
}

static void provnodeput(int p, int i, int v)
{
    ProvNode *e = provfind(p);
    if (e && i >= 0 && i < e->n)
        e->pos[i] = v;
}

void provnodecopy(int dst, int src)
{
    ProvNode *s = provfind(src);
    if (!s) {
        /* The copy must not keep an entry of a freed node that used its address before. */
        provnodefree(dst);
        return;
    }
    int n = s->n;
    int32_t *pos = (int32_t *) xmalloc((size_t) (n > 0 ? n : 1) * sizeof(int32_t));
    memcpy(pos, s->pos, (size_t) n * sizeof(int32_t));
    int ng = s->ng;
    int32_t *clu = NULL;
    if (s->clu && ng > 0) {
        clu = (int32_t *) xmalloc((size_t) ng * sizeof(int32_t));
        memcpy(clu, s->clu, (size_t) ng * sizeof(int32_t));
    }
    provnodenew(dst, 0);
    ProvNode *d = provfind(dst);
    free(d->pos);
    d->pos = pos;
    d->n = n;
    d->clu = clu;
    d->ng = ng;
}

void provfrombuf(int p, int i, int k)
{
    provnodeput(p, i, provbufget(k));
}

void provfromnode(int p, int i, int q, int j)
{
    provnodeput(p, i, provnodeget(q, j));
}

void provbuffromnode(int k, int q, int j)
{
    provbufset(k, provnodeget(q, j));
}

/* The origins of a text collected in the string pool (hlist_out's merge of words and their spaces into one node). */
static int32_t *provacc = NULL;
static int provaccn = 0, provacccap = 0;

void provaccreset(void)
{
    provaccn = 0;
}

void provaccval(int v)
{
    if (provaccn >= provacccap) {
        provacccap = provacccap ? provacccap * 2 : 256;
        provacc = (int32_t *) xrealloc(provacc, (size_t) provacccap * sizeof(int32_t));
    }
    provacc[provaccn++] = v;
}

void provaccnode(int q, int j)
{
    provaccval(provnodeget(q, j));
}

void provfromacc(int p)
{
    for (int i = 0; i < provaccn; i++)
        provnodeput(p, i, provacc[i]);
}

/* A font mapping (tex-text: -- to an en dash, '' to a quote) changes the text: each output character takes the origin of the first input character it replaces, aligned greedily. */
static int32_t *provmapped = NULL;
static int provmappedcap = 0;

void provmap(int inLen, int outLen)
{
    if (outLen > provmappedcap) {
        provmappedcap = outLen * 2;
        provmapped = (int32_t *) xrealloc(provmapped, (size_t) provmappedcap * sizeof(int32_t));
    }
    const UTF16code *in = nativetext;
    const UTF16code *out = mappedtext;
    int i = 0;
    for (int o = 0; o < outLen; o++) {
        provmapped[o] = provbufget(i < inLen ? i : inLen - 1);
        if (i < inLen && in[i] == out[o]) {
            i++;
            continue;
        }
        int step = 1;
        for (int k = 1; k <= 3 && i + k <= inLen; k++) {
            if (o + 1 == outLen ? i + k == inLen : (i + k < inLen && in[i + k] == out[o + 1])) {
                step = k;
                break;
            }
        }
        i += step;
    }
}

int provmapget(int i)
{
    return i >= 0 && i < provmappedcap ? provmapped[i] : 0;
}

/* After an OpenType layout of a node's whole text: each glyph's cluster, kept with the node (measure_native_node, single direction run). */
void provClusters(void *pNode, void *engine, int count)
{
    memoryword *base = (memoryword *) pNode;
    ProvNode *e = provfind((int) (base - zmem));
    if (!e || count <= 0)
        return;
    e->clu = (int32_t *) xrealloc(e->clu, (size_t) count * sizeof(int32_t));
    e->ng = count;
    provGetClusters(engine, e->clu, count);
}

/* How deep the output is inside content that dvipdfmx moves with a transformation TeX does not know (pgf pictures and their nodes, rotated or scaled boxes): words there are not where TeX put them. */
static int provtransformed = 0;

static int provhasprefix(int from, int to, const char *prefix)
{
    int k = from;
    while (k < to && strpool[k] == ' ')
        k++;
    for (const char *c = prefix; *c; c++, k++) {
        if (*c == ' ') {
            while (k < to && strpool[k] == ' ')
                k++;
            k--;
            continue;
        }
        if (k >= to || strpool[k] != (unsigned char) *c)
            return 0;
    }
    return 1;
}

/* A special shipped out: dvipdfmx's bcontent/econtent and btrans/etrans open and close such content (spaces after "pdf:" are allowed, as pgf writes them). */
void provspecial(int from, int to)
{
    if (provhasprefix(from, to, "pdf: bcontent") || provhasprefix(from, to, "pdf: btrans"))
        provtransformed++;
    else if ((provhasprefix(from, to, "pdf: econtent") || provhasprefix(from, to, "pdf: etrans")) && provtransformed > 0)
        provtransformed--;
}

/* A new page starts: content transformed on an earlier page (an unclosed bcontent) does not reach it. */
void provpage(void)
{
    provtransformed = 0;
}

/* One line of main.prov per native word shipped out: page, h, v, width, font size (sp), glyph count and each glyph's x offset (sp, as written to the XDV); then "|", the character count and each character's origin (packed line*4096+column, 0 for none); then "|" and each glyph's cluster (first character index), when shaping kept them; then "|" and each character (UTF-16 code unit), so a reader can check an origin against the source; then "|" and 1 when the word is inside transformed content (its position is not where it shows), else 0. */
static FILE *provfile = NULL;

static int provopen(void)
{
    if (provfile == NULL) {
        provfile = fopen("main.prov", "w");
        if (provfile == NULL)
            return 0;
        setvbuf(provfile, NULL, _IOLBF, 0);
    }
    return 1;
}

void provWord(void *pNode, int h, int v, int page, int size, int key)
{
    memoryword *p = (memoryword *) pNode;
    int n = native_glyph_count(p);
    FixedPoint *loc = (FixedPoint *) native_glyph_info_ptr(p);
    int len = native_length(p);
    ProvNode *e = provfind(key);
    int i;
    if (!provopen())
        return;
    fprintf(provfile, "w %d %d %d %d %d %d", page, h, v, (int) node_width(p), size, loc ? n : 0);
    for (i = 0; loc && i < n; i++)
        fprintf(provfile, " %d", (int) loc[i].x);
    fprintf(provfile, " | %d", e ? len : 0);
    for (i = 0; e && i < len; i++)
        fprintf(provfile, " %d", i < e->n ? (int) e->pos[i] : 0);
    fputs(" |", provfile);
    if (e && e->clu && loc && e->ng == n)
        for (i = 0; i < n; i++)
            fprintf(provfile, " %d", (int) e->clu[i]);
    fputs(" |", provfile);
    for (i = 0; i < len; i++)
        fprintf(provfile, " %d", (int) ((uint16_t *) (p + native_node_size))[i]);
    fprintf(provfile, " | %d\n", provtransformed > 0 ? 1 : 0);
}

/* Examance (issue #352): each shipped page reaches the host at once for drawn pages. The XDV file is flushed, then one write to main.pages carries the
   page count and the bytes TeX still holds in dvi_buf (tex.web's dvi_swap: with dvi_limit=dvi_buf_size they are dvi_buf[0..dvi_ptr), else the second
   half and then dvi_buf[0..dvi_ptr)), so the XDV written so far plus them ends at this page's eop. Only reads TeX's state: the XDV stays byte-identical. */
static int provpagesfd = -1;

void proveop(void)
{
    if (provpagesfd < 0) {
        provpagesfd = open("main.pages", O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (provpagesfd < 0)
            return;
    }
    if (dvifile)
        fflush(dvifile);
    int tail = dvilimit == dvibufsize ? 0 : dvibufsize - halfbuf;
    int len = tail + dviptr;
    unsigned char *rec = (unsigned char *) xmalloc((size_t) len + 8);
    int32_t head[2] = { (int32_t) totalpages, (int32_t) len };
    memcpy(rec, head, 8);
    if (tail)
        memcpy(rec + 8, dvibuf + halfbuf, (size_t) tail);
    memcpy(rec + 8 + tail, dvibuf, (size_t) dviptr);
    if (write(provpagesfd, rec, (size_t) len + 8) < 0)
        provpagesfd = -2;
    free(rec);
}

/* Examance (issue #352): glyph outlines from XeTeX's FreeType for drawn pages, in font units: out[0] units per em, out[1] advance, then commands
   0 x y (move), 1 x y (line), 2 cx cy x y (conic), 3 c1x c1y c2x c2y x y (cubic). The glyph is a name (Type1 with an encoding), a character code
   -(code+1) of the font's own encoding (Type1 without one), or a glyph id. Returns the number of values (more than cap: call again with a larger
   buffer) or a negative error. Faces stay open, so the fonts stay loaded between keystrokes. Called from a separate instance, never during a run. */
#include FT_OUTLINE_H

#define PROV_FACES 48
static struct { char *path; int index; FT_Face face; } provfaces[PROV_FACES];
static int provnfaces = 0;

static FT_Face provface(const char *path, int index)
{
    int i;
    FT_Face f = NULL;
    for (i = 0; i < provnfaces; i++)
        if (provfaces[i].index == index && strcmp(provfaces[i].path, path) == 0)
            return provfaces[i].face;
    if (!gFreeTypeLibrary && FT_Init_FreeType(&gFreeTypeLibrary))
        return NULL;
    if (FT_New_Face(gFreeTypeLibrary, path, index, &f))
        return NULL;
    /* A Type1 font's own encoding, for character codes without an encoding file. */
    if (FT_Select_Charmap(f, FT_ENCODING_ADOBE_CUSTOM) && FT_Select_Charmap(f, FT_ENCODING_ADOBE_STANDARD))
        FT_Select_Charmap(f, FT_ENCODING_UNICODE);
    if (provnfaces == PROV_FACES) {
        FT_Done_Face(provfaces[0].face);
        free(provfaces[0].path);
        memmove(provfaces, provfaces + 1, sizeof(provfaces[0]) * (PROV_FACES - 1));
        provnfaces--;
    }
    provfaces[provnfaces].path = xstrdup(path);
    provfaces[provnfaces].index = index;
    provfaces[provnfaces].face = f;
    provnfaces++;
    return f;
}

typedef struct { int32_t *out; int n; int cap; } ProvSink;

static void provput(ProvSink *s, int32_t v)
{
    if (s->n < s->cap)
        s->out[s->n] = v;
    s->n++;
}

static int provmove(const FT_Vector *to, void *u) { provput(u, 0); provput(u, to->x); provput(u, to->y); return 0; }
static int provline(const FT_Vector *to, void *u) { provput(u, 1); provput(u, to->x); provput(u, to->y); return 0; }
static int provconic(const FT_Vector *c, const FT_Vector *to, void *u)
{
    provput(u, 2); provput(u, c->x); provput(u, c->y); provput(u, to->x); provput(u, to->y);
    return 0;
}
static int provcubic(const FT_Vector *c1, const FT_Vector *c2, const FT_Vector *to, void *u)
{
    provput(u, 3); provput(u, c1->x); provput(u, c1->y); provput(u, c2->x); provput(u, c2->y); provput(u, to->x); provput(u, to->y);
    return 0;
}

int prov_glyph_outline(const char *path, int index, int glyph, const char *name, int32_t *out, int cap)
{
    static const FT_Outline_Funcs funcs = { provmove, provline, provconic, provcubic, 0, 0 };
    ProvSink sink = { out, 0, cap };
    FT_UInt g;
    FT_Face f = provface(path, index);
    if (!f)
        return -1;
    if (name && *name)
        g = FT_Get_Name_Index(f, (FT_String *) name);
    else if (glyph < 0)
        g = FT_Get_Char_Index(f, (FT_ULong) (-glyph - 1));
    else
        g = (FT_UInt) glyph;
    if (FT_Load_Glyph(f, g, FT_LOAD_NO_SCALE | FT_LOAD_NO_HINTING | FT_LOAD_NO_BITMAP))
        return -2;
    if (f->glyph->format != FT_GLYPH_FORMAT_OUTLINE)
        return -3;
    provput(&sink, (int32_t) f->units_per_EM);
    provput(&sink, (int32_t) f->glyph->metrics.horiAdvance);
    FT_Outline_Decompose(&f->glyph->outline, &funcs, &sink);
    return sink.n;
}

/* Examance (issue #352): a character of a TFM font shipped out (formulas without unicode-math, legacy text fonts) with an origin, as a one-glyph word
   of main.prov, so clicks in formulas land on the exact character; the code stands in for the character (letters and digits coincide with ASCII,
   and the reader trusts an origin only where the source has that character). The origin comes from set_math_char/scan_math through the noads. */
void provchar(int p, int h, int v, int page, int size, int code, int width)
{
    int32_t origin = provget(p);
    if (origin <= 0 || !provopen())
        return;
    fprintf(provfile, "w %d %d %d %d %d 1 0 | 1 %d | 0 | %d | %d\n", page, h, v, width, size, (int) origin, code, provtransformed > 0 ? 1 : 0);
}
