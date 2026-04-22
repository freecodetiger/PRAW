#!/usr/bin/env bash

set -euo pipefail

APT_ENV=(
  DEBIAN_FRONTEND=noninteractive
  APT_LISTCHANGES_FRONTEND=none
)

APT_OPTIONS=(
  -y
  --no-install-recommends
  -o
  Acquire::Retries=3
  -o
  Acquire::http::Timeout=30
  -o
  Acquire::https::Timeout=30
  -o
  Dpkg::Use-Pty=0
)

PACKAGES=(
  build-essential
  curl
  wget
  file
  libwebkit2gtk-4.1-dev
  libasound2-dev
  libxdo-dev
  libssl-dev
  libayatana-appindicator3-dev
  librsvg2-dev
  patchelf
  rpm
)

run_apt_with_retries() {
  local label="$1"
  shift

  for attempt in 1 2 3; do
    echo "[linux-deps] ${label} (attempt ${attempt}/3)"

    if timeout 15m sudo env "${APT_ENV[@]}" "$@"; then
      return 0
    fi

    if [[ "${attempt}" == "3" ]]; then
      echo "[linux-deps] ${label} failed after ${attempt} attempts" >&2
      return 1
    fi

    echo "[linux-deps] ${label} failed; sleeping before retry" >&2
    sleep 5
  done
}

run_apt_with_retries "apt-get update" apt-get update
run_apt_with_retries "apt-get install" apt-get install "${APT_OPTIONS[@]}" "${PACKAGES[@]}"
