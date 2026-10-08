# Orca 46 with the AT-SPI accessibility bus and a headed Chromium (Playwright's,
# matching frontend/package.json) for scripts/run-line-history-orca.sh.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    orca xvfb dbus-x11 at-spi2-core python3-pyatspi speech-dispatcher gsettings-desktop-schemas libglib2.0-bin \
 && rm -rf /var/lib/apt/lists/*
