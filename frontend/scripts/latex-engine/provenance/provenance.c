
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

void provWord(void *pNode, int h, int v, int page, int size, int key)
{
    memoryword *p = (memoryword *) pNode;
    int n = native_glyph_count(p);
    FixedPoint *loc = (FixedPoint *) native_glyph_info_ptr(p);
    int len = native_length(p);
    ProvNode *e = provfind(key);
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
