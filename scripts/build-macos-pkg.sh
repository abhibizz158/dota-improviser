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
# pkgbuild's --analyze output varies by macOS version: some already default these keys (Set works), others omit
# them entirely (Set fails with "Does Not Exist" — Add is needed instead). Try Set first, fall back to Add.
set_key() { "$plist" -c "Set :0:$1 $2" "$stage/components.plist" 2>/dev/null || "$plist" -c "Add :0:$1 $3 $2" "$stage/components.plist"; }
set_key BundleIsRelocatable false bool
set_key BundleIsVersionChecked true bool
set_key BundleOverwriteAction upgrade string
pkgbuild --root "$stage/root" --component-plist "$stage/components.plist" \
  --identifier com.dotaimproviser.app.installer --version "$version" --install-location /Applications "$output"
