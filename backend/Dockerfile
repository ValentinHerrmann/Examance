# TeX Live (issue #341), installed in a throwaway stage so the final image gets only /opt/texlive.
# Pinned to a dated snapshot of the TeX Live repository; upgrade by bumping both values together
# (sha256 of that day's install-tl-unx.tar.gz). Packages: latex-texlive/packages.txt.
FROM python@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36 AS texlive
ARG TL_SNAPSHOT=2026/11/23
ARG TL_INSTALLER_SHA256=0ae16c4b38ed3877c7f126b3726f20ed1ad001751a556ad7b001485253016eb7
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl fontconfig gnupg perl xz-utils \
    && rm -rf /var/lib/apt/lists/*
COPY latex-texlive/ /tmp/latex-texlive/
RUN TL_SNAPSHOT=${TL_SNAPSHOT} TL_INSTALLER_SHA256=${TL_INSTALLER_SHA256} sh /tmp/latex-texlive/install.sh

# Digest-pinned so rebuilds are reproducible and a retagged upstream image
# cannot silently change what ships. Refresh the digest deliberately when
# updating Python.
# python:3.12-slim
FROM python@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

COPY --from=texlive /opt/texlive /opt/texlive
ARG TL_SNAPSHOT=2026/11/23
ENV PATH=/opt/texlive/bin/x86_64-linux:${PATH} \
    TL_SNAPSHOT=${TL_SNAPSHOT}
RUN xelatex --version | head -1

# uv from its digest-pinned release image, like the base image: no unpinned pip install.
COPY --from=ghcr.io/astral-sh/uv:0.13.7@sha256:96f40d3904aad8d0bd010539001d36c8e2188b981e1334471a90c4a1d93bb490 /uv /uvx /bin/

WORKDIR /app

# Copy dependency spec first (layer caching)
COPY pyproject.toml uv.lock ./

# Exactly the locked production dependencies: hash-checked wheels only, so no package runs setup code at build time. The app itself is not installed; it runs from /app.
RUN uv export --frozen --no-dev --no-emit-project -o /tmp/requirements.txt \
 && uv pip install --system --no-cache --require-hashes --no-build -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt
ENV PYTHONPATH=/app

# Drop privileges. uvicorn and every TeX subprocess it spawns run as this
# user, so a compiler bug or a future path-traversal cannot read the host as
# root. LATEX_FORMAT_DIR (formats built from template preambles, issue #341) must be writable by it.
ENV LATEX_FORMAT_DIR=/var/cache/latex-formats
# /data/blobs: scan file partition (issue #114); a new named volume inherits this owner.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin appuser \
 && mkdir -p "${LATEX_FORMAT_DIR}" /data/blobs \
 && chown -R appuser:appuser /app "${LATEX_FORMAT_DIR}" /data/blobs
USER appuser

# Copy application source; the LaTeX assets and TeX Live settings are read at runtime by services/texrunner.py.
COPY --chown=appuser:appuser latex-assets/ ./latex-assets/
COPY --chown=appuser:appuser latex-texlive/ ./latex-texlive/
COPY --chown=appuser:appuser latex-warmup/ ./latex-warmup/
COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser alembic/ ./alembic/
COPY --chown=appuser:appuser alembic.ini ./

# Compile the warm-up document once: proves TeX Live has every package the template needs (a
# missing one fails the build) and builds its format, which seeds a new format volume.
RUN sh ./latex-warmup/warmup.sh

# Build version, reported by GET /api/health. Passed by the deploy workflows
# from the repository-root VERSION file; the default keeps local builds honest
# about being untagged rather than claiming a release number.
# Declared last on purpose: the preview version carries a build timestamp, so
# it changes on every build and invalidates every layer after it. Anywhere
# earlier, it would re-install all dependencies on each deploy and make the
# server pull them again.
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=${APP_VERSION}

EXPOSE 8000

# --forwarded-allow-ips must name the actual reverse proxy, never "*": with a
# wildcard any client could spoof X-Forwarded-For to reset its own rate-limit
# bucket and poison the audit log's IP hashes. Override at deploy time with the
# proxy's real address/CIDR; the loopback default is safe but means every
# request behind a proxy is attributed to the proxy.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
