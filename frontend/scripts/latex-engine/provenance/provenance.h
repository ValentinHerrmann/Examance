
/* Examance (issue #347): token origins, see provenance.ch. */
extern int32_t provcur;
extern int32_t *provmem;
void provalloc(int lo, int hi);
#define provget(p) (provmem[(p)])
#define provset(p, v) (provmem[(p)] = (v))
void provWord(void *pNode, int h, int v, int page, int size);
#define provword(p, h, v, page, size) provWord(&(mem[(p)]), (h), (v), (page), (size))
