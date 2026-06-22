# =============================================================================
# MalwAIre Backend — Multi-stage Dockerfile (Sprint 2)
#
# Build args:
#   WITH_GHIDRA=true (default) — full image including Ghidra decompilation
#   WITH_GHIDRA=false          — fast build for CI, skips Ghidra download
#
# Usage:
#   Full build (default, includes Ghidra): docker compose build
#   Fast build (no Ghidra, CI only):       docker compose build --build-arg WITH_GHIDRA=false
#
# When WITH_GHIDRA=false, the decompilation module returns a loud, structured
#   error: {"error": "analyzeHeadless not found in /opt/ghidra", "ghidra_missing": true}
# Everything else in the pipeline works normally.
#
# Security:
#   - Non-root user (malwaire:malwaire)
#   - libmagic for magic byte validation
#   - All analysis tools perform STATIC analysis only (no execution)
#   - No shell=True in subprocess calls
# =============================================================================

ARG WITH_GHIDRA=true

# =============================================================================
# Stage 1: Builder — pip packages + vendored YARA/capa rules
# =============================================================================
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies for native Python extensions:
#   gcc/g++    — required by yara-python, capstone
#   libffi-dev — required by various cffi-based packages
#   libssl-dev — required by cryptography
#   automake/libtool/make/pkg-config — yara-python build system
#   libjansson-dev — yara JSON support
#   libmagic-dev — python-magic
#   git — for cloning rule repositories
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc g++ libffi-dev libssl-dev \
        automake libtool make pkg-config \
        libjansson-dev libmagic-dev \
        git wget unzip && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Vendor YARA community rules (curated subset: malware, packers, crypto, capabilities, CVEs)
RUN git clone --depth 1 https://github.com/Yara-Rules/rules.git /tmp/yara-rules && \
    mkdir -p /build/yara-rules && \
    for dir in malware packers crypto capabilities cve_rules; do \
        if [ -d "/tmp/yara-rules/$dir" ]; then \
            cp -r "/tmp/yara-rules/$dir" /build/yara-rules/; \
        fi; \
    done && \
    rm -rf /tmp/yara-rules

COPY patch_yara_rules.py .
RUN python3 patch_yara_rules.py


# Vendor capa rules (Mandiant FLARE capability definitions + ATT&CK mapping)
RUN git clone --depth 1 https://github.com/mandiant/capa-rules.git /build/capa-rules && \
    rm -rf /build/capa-rules/.git


# Vendor capa FLIRT signatures (needed for PE library function identification).
# Without these, capa exits with OSError on PE files (ELF skips PE signatures).
# capa's Python package looks for them at:
#   /usr/local/lib/python3.12/site-packages/sigs
# Since /install is copied to /usr/local, stage them under:
#   /install/lib/python3.12/site-packages/sigs
#
# Reference: https://github.com/mandiant/capa/blob/master/doc/installation.md
#            #method-2-using-capa-as-a-python-library
RUN CAPA_VER=$(PYTHONPATH=/install/lib/python3.12/site-packages python -c 'from importlib.metadata import version; print(version("flare-capa"))') && \
    echo "Installing capa FLIRT signatures for version: ${CAPA_VER}" && \
    SIGS_DIR="/install/lib/python3.12/site-packages/sigs" && \
    echo "Signatures target: ${SIGS_DIR}" && \
    mkdir -p "${SIGS_DIR}" && \
    wget -q -O /tmp/capa-src.zip \
        "https://github.com/mandiant/capa/archive/refs/tags/v${CAPA_VER}.zip" && \
    unzip -q -o /tmp/capa-src.zip "capa-${CAPA_VER}/sigs/*" -d /tmp && \
    cp -r /tmp/capa-${CAPA_VER}/sigs/. "${SIGS_DIR}/" && \
    rm -rf /tmp/capa-src.zip /tmp/capa-${CAPA_VER} && \
    test -f "${SIGS_DIR}/1_flare_msvc_rtf_32_64.sig" && \
    test -f "${SIGS_DIR}/2_flare_msvc_atlmfc_32_64.sig" && \
    test -f "${SIGS_DIR}/3_flare_common_libs.sig" && \
    echo "Signatures installed: $(find ${SIGS_DIR} -type f | wc -l) files"


# =============================================================================
# Stage 2a: Ghidra download (only used when WITH_GHIDRA=true)
# Uses eclipse-temurin which already has Java — saves installing it twice
# =============================================================================
FROM eclipse-temurin:21-jre-noble AS ghidra-download

ARG WITH_GHIDRA=true

RUN apt-get update && \
    apt-get install -y --no-install-recommends wget unzip && \
    rm -rf /var/lib/apt/lists/*

# Only download Ghidra when explicitly requested
# The 'false' branch creates an empty placeholder so COPY --from= doesn't fail
ARG GHIDRA_VERSION=11.3.1
ARG GHIDRA_DATE=20250219
RUN if [ "$WITH_GHIDRA" = "true" ]; then \
        echo "Downloading Ghidra ${GHIDRA_VERSION}..." && \
        wget -q "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VERSION}_build/ghidra_${GHIDRA_VERSION}_PUBLIC_${GHIDRA_DATE}.zip" \
            -O /tmp/ghidra.zip && \
        unzip -q /tmp/ghidra.zip -d /opt && \
        mv /opt/ghidra_* /opt/ghidra && \
        rm /tmp/ghidra.zip && \
        rm -rf /opt/ghidra/docs \
               /opt/ghidra/licenses \
               /opt/ghidra/Extensions/Eclipse && \
        chmod +x /opt/ghidra/support/analyzeHeadless && \
        echo "Ghidra installed successfully"; \
    else \
        echo "Skipping Ghidra download (WITH_GHIDRA=false)" && \
        mkdir -p /opt/ghidra && \
        echo "placeholder" > /opt/ghidra/.no_ghidra; \
    fi


# =============================================================================
# Stage 3: Runtime — final lean image
# =============================================================================
FROM python:3.12-slim AS runtime

ARG WITH_GHIDRA=true

# Runtime system dependencies:
#   libmagic1              — python-magic file type detection
#   tini                   — PID 1 init (proper signal handling in containers)
#   libjansson4            — YARA JSON support at runtime
#   openjdk-21-jdk-headless — Ghidra JVM requirement (Ghidra strictly requires a JDK to compile scripts)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libmagic1 tini \
        libjansson4 \
        openjdk-21-jdk-headless \
        wget && \
    wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh && \
    chmod +x /tmp/dotnet-install.sh && \
    /tmp/dotnet-install.sh --channel 6.0 --install-dir /usr/share/dotnet && \
    ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet && \
    rm /tmp/dotnet-install.sh && \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 dotnet tool install ilspycmd --version 8.1.1.7464 --tool-path /usr/local/bin && \
    apt-get purge -y wget && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*
    
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# Copy installed Python packages from builder stage
COPY --from=builder /install /usr/local

# Copy Ghidra from download stage (placeholder dir if WITH_GHIDRA=false)
COPY --from=ghidra-download /opt/ghidra /opt/ghidra
ENV GHIDRA_INSTALL_DIR=/opt/ghidra

# Copy vendored YARA and capa rule sets
COPY --from=builder /build/yara-rules /app/yara-rules
COPY --from=builder /build/capa-rules /app/capa-rules

# Create non-root user for security
RUN groupadd -r malwaire && \
    useradd -r -g malwaire -d /app -s /sbin/nologin malwaire

WORKDIR /app

# Create directories with correct ownership
RUN mkdir -p /app/quarantine /app/data && \
    chown -R malwaire:malwaire /app

# Copy application code
COPY --chown=malwaire:malwaire . /app/

# Switch to non-root user
USER malwaire

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Default command: run the API server
ENTRYPOINT ["tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

EXPOSE 8000
