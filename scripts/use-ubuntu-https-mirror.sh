#!/usr/bin/env bash
set -euo pipefail

# The optional directory lets regression tests use fixtures instead of system APT.
apt_directory="${1:-/etc/apt}"

# Current runners use mirror+file: URIs, so update their mirror lists as well as
# legacy sources.list and deb822 sources. Keep suites, keys and other hosts intact.
for ubuntu_sources_file in \
  "$apt_directory/sources.list" \
  "$apt_directory"/sources.list.d/*.list \
  "$apt_directory"/sources.list.d/*.sources \
  "$apt_directory"/apt-mirrors*.txt; do
  if [ -f "$ubuntu_sources_file" ]; then
    sed -i -E \
      -e 's|https?://azure\.archive\.ubuntu\.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
      -e 's|http://archive\.ubuntu\.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
      "$ubuntu_sources_file"
    printf 'Configured Ubuntu HTTPS mirror in %s\n' "$ubuntu_sources_file"
  fi
done
