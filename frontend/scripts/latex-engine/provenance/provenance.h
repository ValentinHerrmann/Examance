/* Examance (issue #347): token and character origins, see provenance.ch. */
#ifdef __cplusplus
extern "C" {
#endif
extern int32_t provcur;
extern int32_t *provmem;
void provalloc(int lo, int hi);
#define provget(p) (provmem[(p)])
#define provset(p, v) (provmem[(p)] = (v))
void provWord(void *pNode, int h, int v, int page, int size, int key);
#define provword(p, h, v, page, size) provWord(&(mem[(p)]), (h), (v), (page), (size), (p))
void provbufset(int k, int v);
void provbufcopy(int k, int from);
void provbuffromnode(int k, int q, int j);
void provnodenew(int p, int n);
void provnodefree(int p);
void provnodecopy(int dst, int src);
void provfrombuf(int p, int i, int k);
void provfromnode(int p, int i, int q, int j);
void provaccreset(void);
void provaccnode(int q, int j);
void provaccval(int v);
void provfromacc(int p);
void provmap(int inLen, int outLen);
int provmapget(int i);
void provspecial(int from, int to);
void provpage(void);
void proveop(void);
void provchar(int p, int h, int v, int page, int size, int code, int width);
int prov_glyph_outline(const char *path, int index, int glyph, const char *name, int32_t *out, int cap);
void provClusters(void *pNode, void *engine, int count);
void provGetClusters(void *engine, int32_t *out, int count);
#ifdef __cplusplus
}
#endif
