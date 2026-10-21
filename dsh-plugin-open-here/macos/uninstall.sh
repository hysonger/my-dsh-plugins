#!/usr/bin/env bash
# uninstall.sh — 移除 open-here 的 Finder 集成（快速操作与 DSH Open.app）。
# 不影响插件本体与 dsh-open 命令。

set -euo pipefail

DEST="$HOME/Library/Services/Open in DSH.workflow"
APP_DEFAULT="$HOME/Applications/DSH Open.app"
APP_SYSTEM="/Applications/DSH Open.app"

removed=0
for target in "$DEST" "$APP_DEFAULT" "$APP_SYSTEM"; do
  if [ -e "$target" ]; then
    rm -rf "$target"
    echo "removed: $target"
    removed=1
  fi
done

"/System/Library/CoreServices/pbs" -flush 2>/dev/null || true

if [ "$removed" -eq 0 ]; then
  echo "nothing to remove"
fi
