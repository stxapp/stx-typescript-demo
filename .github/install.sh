#!/usr/bin/env bash
# Install dependencies for CI: a plain `npm install` once
# @stxapp/stx-typescript is on npm. Until then, when the SDK_RELEASE_REPO and
# SDK_RELEASE_TOKEN secrets are set, it installs the SDK from the release
# tarball under the npm name. Remove the tarball fallback, this script and the
# two secrets once the package is on npm.
set -euo pipefail

if npm view "@stxapp/stx-typescript@^0.4.2" version >/dev/null 2>&1; then
  npm install
  exit 0
fi

if [ -z "${SDK_RELEASE_REPO:-}" ] || [ -z "${SDK_RELEASE_TOKEN:-}" ]; then
  echo "::error::@stxapp/stx-typescript is not on npm yet and no release tarball is configured."
  exit 1
fi

GH_TOKEN="$SDK_RELEASE_TOKEN" gh release download v0.4.2 --repo "$SDK_RELEASE_REPO" --pattern '*.tgz' --dir "$RUNNER_TEMP"
tgz=$(ls "$RUNNER_TEMP"/*.tgz | head -n 1)
npm install --no-save "@stxapp/stx-typescript@file:$tgz"
