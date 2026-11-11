#!/usr/bin/env bash
set -euo pipefail

# The optional directory lets regression tests use fixtures instead of system APT.
apt_directory="${1:-/etc/apt}"

# Current runners use mirror+file: URIs, so update their mirror lists as well as
# legacy sources.list and deb822 sources. The canonical Ubuntu hosts currently
# fail DNS on runners; this HTTPS mirror serves the same Ubuntu-signed indexes.
# Keep suites, signing keys, priorities and non-Ubuntu repositories intact.
ubuntu_https_mirror='https://mirrors.edge.kernel.org/ubuntu'
for ubuntu_sources_file in \
  "$apt_directory/sources.list" \
  "$apt_directory"/sources.list.d/*.list \
  "$apt_directory"/sources.list.d/*.sources \
  "$apt_directory"/apt-mirrors*.txt; do
  if [ -f "$ubuntu_sources_file" ]; then
    sed -i -E \
      -e "s#https?://(azure\.)?archive\.ubuntu\.com/ubuntu([/[:space:]]|\$)#${ubuntu_https_mirror}\\2#g" \
      -e "s#https?://security\.ubuntu\.com/ubuntu([/[:space:]]|\$)#${ubuntu_https_mirror}\\1#g" \
      "$ubuntu_sources_file"
    printf 'Configured Ubuntu HTTPS mirror in %s\n' "$ubuntu_sources_file"
  fi
done
