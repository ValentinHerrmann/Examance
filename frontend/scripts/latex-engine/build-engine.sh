#!/bin/bash
# Builds the browser LaTeX engine (src/lib/latex/engine/): asyncified XeTeX and xdvipdfmx WASM plus ICU data, from pinned TeX Live sources.
# Derived from scripts/build-wasm-xetex.sh of let-def/texpresso (branch eclipse, MIT); differences are marked "ours:". Report: docs/dev/latex_performance.md.
# Needs: emsdk 4.0.12 activated (emcc on PATH), git, a host C compiler, native tangle/ctangle/tie on PATH (Debian: texlive-binaries), ~3 GB disk, ~40 min on 4 cores.
# Usage: scripts/latex-engine/build-engine.sh <work dir> [<install dir>]
# Output: <work dir>/out/; with <install dir> (static/core/latex-engine) also the gzipped files and SHA256SUMS that the app serves.
set -euo pipefail

WORK="$(mkdir -p "${1:?work dir}" && cd "$1" && pwd)"
INSTALL="${2:-}"
TEXPRESSO_COMMIT="c3a321b25bc1f9755b2d486ac0f1fcedd3c0ba11" # eclipse, 2026-08-11 (only the fontconfig shim is used)
TEXLIVE_BRANCH="tags/texlive-2026.1"
TEXLIVE_COMMIT="6a300188053b8f2ded89dbd52293732a706b9c0e"

command -v emcc >/dev/null || { echo "emcc not on PATH (source emsdk_env.sh)" >&2; exit 1; }
# Another emscripten produces other bytes, and CI compares them with the committed files (.github/workflows/latex-engine.yml).
emcc --version | head -1 | grep -q " 4\.0\.12 " || { echo "emsdk 4.0.12 is required, found: $(emcc --version | head -1)" >&2; exit 1; }
command -v tangle >/dev/null && command -v ctangle >/dev/null && command -v tie >/dev/null || { echo "native tangle, ctangle and tie are needed for cross-compiling web2c" >&2; exit 1; }
emcc --version | head -1

SRC="$WORK/texlive-source"
TP="$WORK/texpresso"
if [[ ! -d "$SRC/.git" ]]; then git clone --depth 1 --branch "$TEXLIVE_BRANCH" https://github.com/TeX-Live/texlive-source "$SRC"; fi
[[ "$(git -C "$SRC" rev-parse HEAD)" = "$TEXLIVE_COMMIT" ]] || { echo "texlive-source is not at $TEXLIVE_COMMIT" >&2; exit 1; }
if [[ ! -d "$TP/.git" ]]; then
  git init -q "$TP" && git -C "$TP" fetch -q --depth 1 https://github.com/let-def/texpresso "$TEXPRESSO_COMMIT" && git -C "$TP" checkout -q FETCH_HEAD
fi
SHIM="$TP/src/engine-wasm/fontconfig-shim"
BUILD="$WORK/build"

# ours: source provenance for click-to-source and inline editing (issue #347): every token keeps its line and column in main.tex, SyncTeX records carry them, and every typeset character and glyph keeps its own (provenance/).
# Applied to pristine files on every run, so a rerun in the same work dir picks up changes to provenance/.
PROV="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/provenance"
W2C="$SRC/texk/web2c"
XD="texk/web2c/xetexdir"
git -C "$SRC" checkout -q -- texk/web2c/Makefile.in "$XD/xetex.defines" "$XD/XeTeX_ext.h" "$XD/XeTeX_ext.c" "$XD/XeTeXLayoutInterface.cpp"
cp "$PROV/provenance.ch" "$W2C/xetexdir/examance-provenance.ch"
sed -i 's|^\ttex-binpool.ch$|\ttex-binpool.ch \\\n\txetexdir/examance-provenance.ch|' "$W2C/Makefile.in"
grep -q "examance-provenance.ch" "$W2C/Makefile.in" || { echo "could not add provenance.ch to xetex_ch_srcs" >&2; exit 1; }
cat "$PROV/provenance.defines" >> "$W2C/xetexdir/xetex.defines"
cat "$PROV/provenance.h" >> "$W2C/xetexdir/XeTeX_ext.h"
cat "$PROV/provenance.c" >> "$W2C/xetexdir/XeTeX_ext.c"
cat "$PROV/provenance.cpp" >> "$W2C/xetexdir/XeTeXLayoutInterface.cpp"
# The glyph clusters of a whole-text OpenType layout (the single-direction branch of measure_native_node; mixed-direction text keeps none).
sed -i 's|^            getGlyphPositions(engine, positions);$|&\n            provClusters(node, engine, totalGlyphCount);|' "$W2C/xetexdir/XeTeX_ext.c"
[[ "$(grep -c "provClusters(node, engine, totalGlyphCount)" "$W2C/xetexdir/XeTeX_ext.c")" = 1 ]] || { echo "could not add the cluster hook to measure_native_node" >&2; exit 1; }
OUT="$WORK/out"

export EMCC_SKIP_SANITY_CHECK=1
# ours: emscripten-style setjmp/longjmp instead of wasm EH, because Asyncify cannot instrument wasm exception handling.
# ours: -ffile-prefix-map keeps the work dir out of the binary (assert messages), so any checkout rebuilds the same bytes.
WASMFLAGS="-O2 -sSUPPORT_LONGJMP=emscripten -ffile-prefix-map=$WORK=."
# ours: Asyncify unwinds the call stack into linear memory at fd_read, so a checkpoint is a memory copy plus globals.
# ours: -O2 at link so wasm-opt runs after the Asyncify pass; malloc exported for the Asyncify data buffer.
# ours: the import needs its module name; emcc prefixes a bare name with "env.", which matches nothing and silently breaks every resume.
CONFFLAGS="-sSUPPORT_LONGJMP=emscripten -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=16MB -sINITIAL_MEMORY=128MB"
# ours: Asyncify only at the final xetex link; configure's link probes would each run the pass.
LINKFLAGS="$CONFFLAGS -O2 -sMAXIMUM_MEMORY=2GB -sASYNCIFY=1 -sASYNCIFY_IMPORTS=['wasi_snapshot_preview1.fd_read'] -sEXPORTED_FUNCTIONS=['_main','_malloc','_free'] -sEXPORTED_RUNTIME_METHODS=[] -sINVOKE_RUN=0"
CXXWASMFLAGS="$WASMFLAGS -DHB_NO_PRAGMA_GCC_DIAGNOSTIC_ERROR"

BUILD_TRIPLE="$("$SRC/build-aux/config.guess")"
JOBS="$(nproc)"
/bin/cp -f "$SRC/libs/icu/icu-src/source/config/mh-linux" "$SRC/libs/icu/icu-src/source/config/mh-unknown"

mkdir -p "$OUT"
# Lowercase on purpose; these are the autoconf cache variables kpathsea's configure reads, and renaming them would silently drop the fontconfig shim.
export kpse_cv_have_fontconfig=yes # NOSONAR
export kpse_cv_fontconfig_includes="-I$SHIM" # NOSONAR
export kpse_cv_fontconfig_libs="$BUILD/libfcshim.a" # NOSONAR
# RESUME_AT_TEXK=1 keeps the built support libraries and starts at the texk step.
if [[ "${RESUME_AT_TEXK:-0}" != 1 ]]; then
rm -rf "$BUILD"; mkdir -p "$BUILD"; cd "$BUILD"

# ours: SyncTeX stays enabled (upstream passes --disable-xetex-synctex --disable-synctex); PDF-side editing needs it.
emconfigure "$SRC/configure" \
  --build="$BUILD_TRIPLE" --host=wasm32-unknown-emscripten \
  --without-x --disable-shared --disable-all-pkgs \
  --enable-web2c --enable-xetex \
  --disable-tex --disable-etex --disable-pdftex --disable-ptex --disable-eptex \
  --disable-uptex --disable-euptex --disable-aleph \
  --disable-luatex --disable-luajittex --disable-mf --disable-mf-nowin \
  --enable-missing \
  CFLAGS="$WASMFLAGS" CXXFLAGS="$CXXWASMFLAGS" LDFLAGS="$CONFFLAGS"

# ours: libpaper for xdvipdfmx.
LIBS_XETEX="zlib libpng freetype2 graphite2 teckit icu harfbuzz pplib libpaper"
sed -i.bak "s|^CONF_SUBDIRS = .*|CONF_SUBDIRS = $LIBS_XETEX|" libs/Makefile
sed -i.bak2 "s|^MAKE_SUBDIRS = .*|MAKE_SUBDIRS = $LIBS_XETEX|" libs/Makefile

echo "=== support libs (pass 1) ==="
emmake make -C libs -j"$JOBS" || true
sed -i.bak 's|^icu_native_args = .*|& CC=cc CXX=c++ CFLAGS=-O2 CXXFLAGS=-O2 LDFLAGS=|' libs/icu/Makefile
sed -i.bak3 's|^icu_build_args = .*|& --with-data-packaging=archive|' libs/icu/Makefile
sed -i.bak4 's|cp icudt.a libicudata.a)|cp icudt.a libicudata.a \|\| cp ../stubdata/libicudata.a libicudata.a)|' libs/icu/Makefile
rm -rf libs/icu/icu-native libs/icu/icu-build
sed -i.bak "s|CC='\$(CC)' CONFIG_SITE|CC='\$(CC)' CFLAGS='\$(CFLAGS)' CXXFLAGS='\$(CFLAGS)' CONFIG_SITE|" libs/freetype2/Makefile
rm -rf libs/freetype2/ft-build libs/freetype2/ft-config libs/freetype2/ft-install \
       libs/freetype2/libfreetype.* libs/freetype2/freetype2 libs/freetype2/ft2build.h
echo "=== support libs (pass 2) ==="
emmake make -C libs -j"$JOBS"

echo "=== fontconfig shim ==="
FT_INC="-I$BUILD/libs/freetype2/ft-build -I$SRC/libs/freetype2/freetype-src/include"
emcc $WASMFLAGS $FT_INC -I"$SHIM" -c "$SHIM/fcshim.c" -o "$BUILD/fcshim.o"
emar rcs "$BUILD/libfcshim.a" "$BUILD/fcshim.o"
fi
cd "$BUILD"

# ours: texk's own list leaves kpathsea out here; put it first, then dvipdfm-x, then web2c (which fails at lua53 and must come last).
sed -i.bak "s|^CONF_SUBDIRS = .*|CONF_SUBDIRS = kpathsea dvipdfm-x web2c|" texk/Makefile
sed -i.bak2 "s|^MAKE_SUBDIRS = .*|MAKE_SUBDIRS = kpathsea dvipdfm-x web2c|" texk/Makefile
echo "=== configure texk, build kpathsea (web2c fails at lua53, xdvipdfmx at getpass; both are linked below) ==="
# -k: configure and build every subdir despite those expected failures (without it web2c is never configured).
emmake make -k -C texk -j"$JOBS" || true
emmake make -C texk/kpathsea -j"$JOBS"
sed -i.bak "s|^FONTCONFIG_INCLUDES = .*|FONTCONFIG_INCLUDES = -I$SHIM|" texk/web2c/Makefile
sed -i.bak2 "s|^FONTCONFIG_LIBS = .*|FONTCONFIG_LIBS = $BUILD/libfcshim.a|" texk/web2c/Makefile
rm -f texk/web2c/xetexdir/libxetex_a-XeTeXFontMgr_FC.o texk/web2c/xetexdir/libxetex_a-XeTeX_ext.o \
      texk/web2c/xetexdir/libxetex_a-XeTeXLayoutInterface.o
echo "=== link xetex ==="
emmake make -C texk/web2c -j"$JOBS" xetex LDFLAGS="$LINKFLAGS"

# ours: xdvipdfmx with the same flags, so the same host fetches its files lazily; getpass (the encryption prompt) is stubbed.
echo "=== link xdvipdfmx ==="
printf 'char *getpass(const char *prompt) { (void)prompt; return (char *)""; }\n' > getpass-stub.c
emcc -O2 -c getpass-stub.c -o getpass-stub.o
rm -f texk/dvipdfm-x/xdvipdfmx texk/dvipdfm-x/xdvipdfmx.wasm
emmake make -C texk/dvipdfm-x -j"$JOBS" xdvipdfmx LDFLAGS="$LINKFLAGS $BUILD/getpass-stub.o"

cp texk/web2c/xetex.wasm texk/dvipdfm-x/xdvipdfmx.wasm "$OUT/"
cp libs/icu/icu-build/data/out/icudt78l.dat "$OUT/"
(cd "$OUT" && sha256sum xetex.wasm xdvipdfmx.wasm icudt78l.dat | tee SHA256SUMS)

# Deterministic gzip (-n: no name or time), so CI can compare the rebuilt files with the committed ones.
if [[ -n "$INSTALL" ]]; then
  mkdir -p "$INSTALL"
  for f in xetex.wasm xdvipdfmx.wasm icudt78l.dat; do gzip -9 -n -c "$OUT/$f" > "$INSTALL/$f.gz"; done
  cp "$OUT/SHA256SUMS" "$INSTALL/SHA256SUMS"
fi
