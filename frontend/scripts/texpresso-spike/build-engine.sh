#!/bin/bash
# TeXpresso browser spike: builds an asyncified XeTeX engine.wasm for the browser host in src/lib/latex/texpresso-spike/.
# Derived from scripts/build-wasm-xetex.sh of let-def/texpresso (branch eclipse, MIT); differences are marked "spike:".
# Needs: emsdk 4.0.12 activated (emcc on PATH), git, a host C compiler, native tangle/ctangle/tie on PATH (Debian: texlive-binaries), ~3 GB disk, ~40 min on 4 cores.
# Usage: scripts/texpresso-spike/build-engine.sh <work dir>   Output: <work dir>/out/{xetex.wasm,xetex.js,icudt78l.dat}
set -euo pipefail

WORK="$(mkdir -p "${1:?work dir}" && cd "$1" && pwd)"
TEXPRESSO_COMMIT="c3a321b25bc1f9755b2d486ac0f1fcedd3c0ba11" # eclipse, 2026-08-11 (only the fontconfig shim is used)
TEXLIVE_BRANCH="tags/texlive-2026.1"
TEXLIVE_COMMIT="6a300188053b8f2ded89dbd52293732a706b9c0e"

command -v emcc >/dev/null || { echo "emcc not on PATH (source emsdk_env.sh)" >&2; exit 1; }
command -v tangle >/dev/null && command -v ctangle >/dev/null && command -v tie >/dev/null || { echo "native tangle, ctangle and tie are needed for cross-compiling web2c" >&2; exit 1; }
emcc --version | head -1

SRC="$WORK/texlive-source"
TP="$WORK/texpresso"
if [ ! -d "$SRC/.git" ]; then git clone --depth 1 --branch "$TEXLIVE_BRANCH" https://github.com/TeX-Live/texlive-source "$SRC"; fi
[ "$(git -C "$SRC" rev-parse HEAD)" = "$TEXLIVE_COMMIT" ] || { echo "texlive-source is not at $TEXLIVE_COMMIT" >&2; exit 1; }
if [ ! -d "$TP/.git" ]; then
  git init -q "$TP" && git -C "$TP" fetch -q --depth 1 https://github.com/let-def/texpresso "$TEXPRESSO_COMMIT" && git -C "$TP" checkout -q FETCH_HEAD
fi
SHIM="$TP/src/engine-wasm/fontconfig-shim"
BUILD="$WORK/build"
OUT="$WORK/out"

export EMCC_SKIP_SANITY_CHECK=1
# spike: emscripten-style setjmp/longjmp instead of wasm EH, because Asyncify cannot instrument wasm exception handling.
WASMFLAGS="-O2 -sSUPPORT_LONGJMP=emscripten"
# spike: Asyncify unwinds the call stack into linear memory at fd_read, so a checkpoint is a memory copy plus globals.
# spike: -O2 at link so wasm-opt runs after the Asyncify pass; malloc exported for the Asyncify data buffer.
# spike: the import needs its module name; emcc prefixes a bare name with "env.", which matches nothing and silently breaks every resume.
CONFFLAGS="-sSUPPORT_LONGJMP=emscripten -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=16MB -sINITIAL_MEMORY=128MB"
# spike: Asyncify only at the final xetex link; configure's link probes would each run the pass.
LINKFLAGS="$CONFFLAGS -O2 -sMAXIMUM_MEMORY=2GB -sASYNCIFY=1 -sASYNCIFY_IMPORTS=['wasi_snapshot_preview1.fd_read'] -sEXPORTED_FUNCTIONS=['_main','_malloc','_free'] -sEXPORTED_RUNTIME_METHODS=[] -sINVOKE_RUN=0"
CXXWASMFLAGS="$WASMFLAGS -DHB_NO_PRAGMA_GCC_DIAGNOSTIC_ERROR"

BUILD_TRIPLE="$("$SRC/build-aux/config.guess")"
JOBS="$(nproc)"
/bin/cp -f "$SRC/libs/icu/icu-src/source/config/mh-linux" "$SRC/libs/icu/icu-src/source/config/mh-unknown"

mkdir -p "$OUT"
export kpse_cv_have_fontconfig=yes
export kpse_cv_fontconfig_includes="-I$SHIM"
export kpse_cv_fontconfig_libs="$BUILD/libfcshim.a"
# RESUME_AT_TEXK=1 keeps the built support libraries and starts at the texk step.
if [ "${RESUME_AT_TEXK:-0}" != 1 ]; then
rm -rf "$BUILD"; mkdir -p "$BUILD"; cd "$BUILD"

# spike: SyncTeX stays enabled (upstream passes --disable-xetex-synctex --disable-synctex); PDF-side editing needs it.
emconfigure "$SRC/configure" \
  --build="$BUILD_TRIPLE" --host=wasm32-unknown-emscripten \
  --without-x --disable-shared --disable-all-pkgs \
  --enable-web2c --enable-xetex \
  --disable-tex --disable-etex --disable-pdftex --disable-ptex --disable-eptex \
  --disable-uptex --disable-euptex --disable-aleph \
  --disable-luatex --disable-luajittex --disable-mf --disable-mf-nowin \
  --enable-missing \
  CFLAGS="$WASMFLAGS" CXXFLAGS="$CXXWASMFLAGS" LDFLAGS="$CONFFLAGS"

LIBS_XETEX="zlib libpng freetype2 graphite2 teckit icu harfbuzz pplib"
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

# spike: texk's own list leaves kpathsea out here; put it first (configured and built before web2c) and drop the other programs.
sed -i.bak "s|^CONF_SUBDIRS = .*|CONF_SUBDIRS = kpathsea web2c|" texk/Makefile
sed -i.bak2 "s|^MAKE_SUBDIRS = .*|MAKE_SUBDIRS = kpathsea web2c|" texk/Makefile
echo "=== configure texk, build kpathsea (web2c fails at lua53; only xetex is needed) ==="
emmake make -C texk -j"$JOBS" || true
emmake make -C texk/kpathsea -j"$JOBS"
sed -i.bak "s|^FONTCONFIG_INCLUDES = .*|FONTCONFIG_INCLUDES = -I$SHIM|" texk/web2c/Makefile
sed -i.bak2 "s|^FONTCONFIG_LIBS = .*|FONTCONFIG_LIBS = $BUILD/libfcshim.a|" texk/web2c/Makefile
rm -f texk/web2c/xetexdir/libxetex_a-XeTeXFontMgr_FC.o texk/web2c/xetexdir/libxetex_a-XeTeX_ext.o \
      texk/web2c/xetexdir/libxetex_a-XeTeXLayoutInterface.o
echo "=== link xetex ==="
emmake make -C texk/web2c -j"$JOBS" xetex LDFLAGS="$LINKFLAGS"

cp texk/web2c/xetex.wasm "$OUT/"
cp texk/web2c/xetex "$OUT/xetex.js" # libtool names the emscripten glue without its extension
cp libs/icu/icu-build/data/out/icudt78l.dat "$OUT/"
sha256sum "$OUT"/* | tee "$OUT/SHA256SUMS"
