#!/bin/bash
set -euo pipefail
app=$1
output=$2
version=$3
codesign --verify --deep --strict "$app"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/root"
ditto "$app" "$stage/root/Dota Improviser.app"
pkgbuild --analyze --root "$stage/root" "$stage/components.plist"
plist=/usr/libexec/PlistBuddy
"$plist" -c 'Set :0:BundleIsRelocatable false' "$stage/components.plist"
"$plist" -c 'Set :0:BundleIsVersionChecked true' "$stage/components.plist"
"$plist" -c 'Set :0:BundleOverwriteAction upgrade' "$stage/components.plist"
pkgbuild --root "$stage/root" --component-plist "$stage/components.plist" \
  --identifier com.dotaimproviser.app.installer --version "$version" --install-location /Applications "$output"
