#!/usr/bin/env bash
# install-quick-action.sh — 把 "在 DeepSeek Harness 中打开" 快速操作安装到 ~/Library/Services。
# 模板 document.wflow 中的 __DSH_OPEN_BIN__ 会在安装时替换为 dsh-open 的实际绝对路径
#（Automator 的 shell 环境 PATH 极简，必须用绝对路径）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SRC="$SCRIPT_DIR/quick-action/Open in DSH.workflow"
DEST_DIR="$HOME/Library/Services"
DEST="$DEST_DIR/Open in DSH.workflow"

# 优先用 PATH 中的 dsh-open（如 ~/.local/bin），否则回退到本仓库自带脚本。
bin="$(command -v dsh-open || true)"
if [ -z "$bin" ]; then
  bin="$(cd "$SCRIPT_DIR/../bin" && pwd -P)/dsh-open"
fi
if [ ! -x "$bin" ]; then
  echo "install-quick-action: dsh-open not found or not executable: $bin" >&2
  exit 1
fi
# 解析符号链接，写入物理路径，避免日后链接目标变化导致服务失效。
bin="$(cd "$(dirname "$bin")" && pwd -P)/$(basename "$bin")"

mkdir -p "$DEST_DIR"
rm -rf "$DEST"
mkdir -p "$DEST/Contents"

# sed 替换时转义路径中可能存在的 & 和分隔符 |。
bin_escaped="$(printf '%s' "$bin" | sed -e 's/[&|]/\\&/g')"
sed "s|__DSH_OPEN_BIN__|$bin_escaped|g" "$SRC/Contents/document.wflow" > "$DEST/Contents/document.wflow"
cp "$SRC/Contents/Info.plist" "$DEST/Contents/Info.plist"

# 刷新服务注册表，使右键菜单立即可见（失败也无妨，下次登录会生效）。
"/System/Library/CoreServices/pbs" -flush 2>/dev/null || true

echo "installed: $DEST"
echo "dsh-open:  $bin"
echo "现在可在 Finder 右键菜单 → 快速操作（或“服务”）中找到“在 DeepSeek Harness 中打开”。"
