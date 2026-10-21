#!/usr/bin/env bash
# build-app.sh — 把 dsh-open.applescript 编译为 DSH Open.app（droplet）。
#
# 产出的应用支持三种 Finder 入口：
#   1. ⌘-拖入 Finder 工具栏 → 点击按钮打开当前窗口目录；
#   2. 拖入 Dock → 拖放文件/文件夹到图标；
#   3. 右键文件夹 → 打开方式 → DSH Open。
#
# 用法：
#   macos/app/build-app.sh            # 输出到 ~/Applications/DSH Open.app
#   DSH_APP_DIR=/Applications macos/app/build-app.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
APP_NAME="DSH Open"
OUT_DIR="${DSH_APP_DIR:-$HOME/Applications}"
APP="$OUT_DIR/$APP_NAME.app"

# 优先用 PATH 中的 dsh-open，否则回退到本仓库自带脚本。
bin="$(command -v dsh-open || true)"
if [ -z "$bin" ]; then
  bin="$(cd "$SCRIPT_DIR/../../bin" && pwd -P)/dsh-open"
fi
if [ ! -x "$bin" ]; then
  echo "build-app: dsh-open not found or not executable: $bin" >&2
  exit 1
fi
# 解析符号链接，烧入物理路径。
bin="$(cd "$(dirname "$bin")" && pwd -P)/$(basename "$bin")"

mkdir -p "$OUT_DIR"
rm -rf "$APP"

bin_escaped="$(printf '%s' "$bin" | sed -e 's/[&|]/\\&/g')"
tmp_src="$(mktemp /tmp/dsh-open-app.XXXXXX.applescript)"
trap 'rm -f "$tmp_src"' EXIT
sed "s|__DSH_OPEN_BIN__|$bin_escaped|g" "$SCRIPT_DIR/dsh-open.applescript" > "$tmp_src"

osacompile -o "$APP" "$tmp_src"

INFO="$APP/Contents/Info.plist"
# droplet 默认声明通配文档类型（会出现在所有文件的“打开方式”里，太吵）；
# 收窄为目录/文件夹，Alternate 级，不抢占默认打开方式。
plutil -replace CFBundleDocumentTypes -json \
  '[{"LSItemContentTypes":["public.folder","public.directory"],"LSHandlerRank":"Alternate"}]' \
  "$INFO"
# 无 Dock 图标/菜单栏的辅助应用形态。
plutil -insert LSUIElement -bool true "$INFO" 2>/dev/null || \
  plutil -replace LSUIElement -bool true "$INFO"
plutil -replace CFBundleIdentifier -string "ai.deepseek.dsh.open-here.app" "$INFO" 2>/dev/null || \
  plutil -insert CFBundleIdentifier -string "ai.deepseek.dsh.open-here.app" "$INFO"

# Info.plist 改动会使 osacompile 的 ad-hoc 签名失效，重签。
codesign --force --sign - "$APP" >/dev/null 2>&1 || true

echo "built: $APP"
echo "dsh-open: $bin"
echo ""
echo "接下来任选："
echo "  · 按住 ⌘ 把它拖到 Finder 工具栏 → 点击按钮打开当前目录"
echo "  · 拖入 Dock → 把文件/文件夹拖到图标上"
echo "  · 右键文件夹 → 打开方式 → DSH Open"
