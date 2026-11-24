#!/bin/sh
# Installs the pinned TeX Live (issue #341) from a dated snapshot of the TeX Live repository into /opt/texlive.
# Upgrade: bump TL_SNAPSHOT and TL_INSTALLER_SHA256 in backend/Dockerfile together. Runs at image build only.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo="https://texlive.info/tlnet-archive/${TL_SNAPSHOT:?}/tlnet"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl -fsSL --proto "=https" --tlsv1.2 -o "$work/install-tl.tgz" "$repo/install-tl-unx.tar.gz"
echo "${TL_INSTALLER_SHA256:?}  $work/install-tl.tgz" | sha256sum -c -
mkdir "$work/installer"
tar xzf "$work/install-tl.tgz" -C "$work/installer" --strip-components=1
# The installer and tlmgr check the repository's GPG signature (gnupg is installed in the build stage).
TEXLIVE_INSTALL_ENV_NOCHECK=1 perl "$work/installer/install-tl" \
  --profile="$here/profile.txt" --repository "$repo" --no-interaction
/opt/texlive/bin/x86_64-linux/tlmgr --repository "$repo" install $(grep -v '^#' "$here/packages.txt")
/opt/texlive/bin/x86_64-linux/xelatex --version | head -1
