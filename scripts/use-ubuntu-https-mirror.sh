#!/usr/bin/env bash
set -euo pipefail

# The optional directory lets regression tests use fixtures instead of system APT.
apt_directory="${1:-/etc/apt}"

# Current runners use mirror+file: URIs, so update their mirror lists as well as
# legacy sources.list and deb822 sources. Use a reachable HTTPS copy of the
# Ubuntu-signed archive without changing package verification.
# The former kernel.org endpoint times out for package downloads on runners.
# OSU serves the same signed archive; suites, keys and priorities stay intact.
# New AWS-hosted runners also use regional EC2 mirrors in those lists.
ubuntu_https_mirror='https://ubuntu.osuosl.org/ubuntu'
for ubuntu_sources_file in \
  "$apt_directory/sources.list" \
  "$apt_directory"/sources.list.d/*.list \
  "$apt_directory"/sources.list.d/*.sources \
  "$apt_directory"/apt-mirrors*.txt; do
  if [ -f "$ubuntu_sources_file" ]; then
    sed -i -E \
      -e "s#https?://(azure\.)?archive\.ubuntu\.com/ubuntu([/[:space:]]|\$)#${ubuntu_https_mirror}\\2#g" \
      -e "s#https?://security\.ubuntu\.com/ubuntu([/[:space:]]|\$)#${ubuntu_https_mirror}\\1#g" \
      -e "s#https?://mirrors\.edge\.kernel\.org/ubuntu([/[:space:]]|\$)#${ubuntu_https_mirror}\\1#g" \
      -e "s#https?://[a-z0-9-]+\.ec2\.archive\.ubuntu\.com/ubuntu([/[:space:]]|\$)#${ubuntu_https_mirror}\\1#g" \
      "$ubuntu_sources_file"
    printf 'Configured Ubuntu HTTPS mirror in %s\n' "$ubuntu_sources_file"
  fi
done
