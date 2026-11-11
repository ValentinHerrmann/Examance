# Tectonic LaTeX compiler, fetched in a throwaway stage so the final image gets only the binary.
# ADD --checksum verifies the archive: it would otherwise install whatever the URL serves at build time.
FROM python@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36 AS tectonic
ARG TECTONIC_VERSION=0.17.0
ARG TECTONIC_SHA256=8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7
ADD --checksum=sha256:${TECTONIC_SHA256} \
    "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    /tmp/tectonic.tar.gz
RUN tar xz -C /usr/local/bin -f /tmp/tectonic.tar.gz tectonic

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

COPY --from=tectonic /usr/local/bin/tectonic /usr/local/bin/tectonic
RUN tectonic --version

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

# Drop privileges. uvicorn and every tectonic subprocess it spawns run as this
# user, so a compiler bug or a future path-traversal cannot read the host as
# root. TECTONIC_CACHE_DIR must be writable by it.
ENV TECTONIC_CACHE_DIR=/var/cache/tectonic
# /data/blobs: scan file partition (issue #114); a new named volume inherits this owner.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin appuser \
 && mkdir -p "${TECTONIC_CACHE_DIR}" /data/blobs \
 && chown -R appuser:appuser /app "${TECTONIC_CACHE_DIR}" /data/blobs
USER appuser

# Warm Tectonic's cache once, so a fresh deployment's first preview does not time out while
# hundreds of bundle files download (issue #75). Docker seeds a new cache volume from this.
# Placed before the app source so code changes keep this layer cached. Public TeX files only.
COPY --chown=appuser:appuser latex-assets/ ./latex-assets/
COPY --chown=appuser:appuser latex-warmup/ ./latex-warmup/
RUN sh ./latex-warmup/warmup.sh

# Copy application source
COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser alembic/ ./alembic/
COPY --chown=appuser:appuser alembic.ini ./

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
