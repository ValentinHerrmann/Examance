# Digest-pinned so rebuilds are reproducible and a retagged upstream image
# cannot silently change what ships. Refresh the digest deliberately, together
# with the tag, when updating Python.
FROM python:3.12-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Install Tectonic LaTeX compiler.
# The archive is checksum-verified: piping a release tarball straight into tar
# would install whatever the URL happens to serve at build time.
ARG TECTONIC_VERSION=0.17.0
ARG TECTONIC_SHA256=8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7
RUN curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
 && echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum -c - \
 && tar xz -C /usr/local/bin -f /tmp/tectonic.tar.gz \
 && rm /tmp/tectonic.tar.gz \
 && tectonic --version

# Install uv (fast Python package manager)
RUN pip install uv --no-cache-dir

WORKDIR /app

# Copy dependency spec first (layer caching)
COPY pyproject.toml ./

# Install production dependencies
RUN uv pip install --system --no-cache -e "."

# Copy application source
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY latex-assets/ ./latex-assets/

# Drop privileges. uvicorn and every tectonic subprocess it spawns run as this
# user, so a compiler bug or a future path-traversal cannot read the host as
# root. TECTONIC_CACHE_DIR must be writable by it.
ENV TECTONIC_CACHE_DIR=/var/cache/tectonic
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin appuser \
 && mkdir -p "${TECTONIC_CACHE_DIR}" \
 && chown -R appuser:appuser /app "${TECTONIC_CACHE_DIR}"
USER appuser

EXPOSE 8000

# --forwarded-allow-ips must name the actual reverse proxy, never "*": with a
# wildcard any client could spoof X-Forwarded-For to reset its own rate-limit
# bucket and poison the audit log's IP hashes. Override at deploy time with the
# proxy's real address/CIDR; the loopback default is safe but means every
# request behind a proxy is attributed to the proxy.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
