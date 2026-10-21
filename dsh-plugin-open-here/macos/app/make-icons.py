#!/usr/bin/env python3
"""make-icons.py — 生成 DSH Open.app 的图标。

设计：以 DSH 官方图标（DeepSeek 鲸鱼）为母版，提取鲸鱼剪影重新着色，
置于 macOS 圆角矩形底板上，收紧留白以适配 Finder 工具栏的小尺寸显示。

为什么是"单一深浅通用图标"而不是自动切换的深浅变体：
  macOS 26+ 的深浅/着色图标变体（含 Assets.car 里的 appearance 槽位）
  只能由 Icon Composer 产出的 .icon 经 Xcode 构建系统编译，actool 不认
  appiconset 里的 appearance 条目（实测报 "unassigned children"），
  Icon Composer 也无命令行接口。因此默认采用在浅/深两种工具栏背景下
  都清晰克制的石板色底+白鲸方案（slate），另附 light / blue 变体可选。

用法：
  python3 make-icons.py            # 默认 slate
  python3 make-icons.py light      # 官方配色：浅底 + 深鲸
  python3 make-icons.py blue       # 品牌蓝底 + 白鲸

产出（相对本脚本所在目录）：
  icons/DSH Open.iconset/   图标组（iconutil 输入）
  icons/preview.png         512px 预览图

依赖：Pillow（DSH 内置 Python 或任意装了 Pillow 的 python3）。
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ICONS = HERE / "icons"
SOURCE = ICONS / "official-source.png"  # 1024×1024，提取自 DeepSeek Harness.app

# 官方图标中鲸鱼本体的包围盒（1024 坐标系，由像素采样得到）。
WHALE_BBOX = (208, 297, 853, 772)  # (x0, y0, x1, y1)，右/下为开区间
WHALE_FILL_RATIO = 0.80  # 鲸鱼宽度占底板宽度比例
CORNER_RADIUS_RATIO = 0.225  # macOS 连续圆角近似
RENDER_SIZE = 2048  # 超采样母版尺寸

# variant -> (底板渐变起色, 底板渐变止色, 鲸鱼色)
VARIANTS: dict[str, tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]] = {
    # 默认：系统工具栏单色语言，浅色/深色背景下都清晰克制。
    "slate": ((58, 63, 75), (40, 44, 54), (255, 255, 255)),
    # 官方配色：浅底 + 深石板蓝鲸鱼（深色模式下略亮）。
    "light": ((253, 253, 254), (236, 236, 240), (58, 63, 75)),
    # 品牌蓝底 + 白鲸，强调色版本。
    "blue": ((86, 112, 255), (58, 86, 240), (255, 255, 255)),
}

# (points, scales)
ICON_POINTS = ((16, 32, 128, 256, 512), (1, 2))


def extract_whale() -> Image.Image:
    """从官方图标提取鲸鱼剪影（白色 + alpha 覆盖度，便于重新着色）。"""
    src = Image.open(SOURCE).convert("RGBA")
    a = np.asarray(src).astype(np.float32)
    lum = a[..., :3].mean(axis=2)
    # 鲸鱼亮度约 64，底板约 250；在 80~200 之间做软阈值，保留抗锯齿边缘。
    coverage = np.clip((200.0 - lum) / 120.0, 0.0, 1.0) * (a[..., 3] / 255.0)
    mask = Image.fromarray((coverage * 255).astype(np.uint8), "L").crop(WHALE_BBOX)
    white = Image.new("RGBA", mask.size, (255, 255, 255, 255))
    white.putalpha(mask)
    return white


def rounded_tile(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """垂直线性渐变的圆角矩形底板。"""
    grad = np.linspace(0, 1, size, dtype=np.float32)[:, None, None]
    arr = (
        np.array(top, dtype=np.float32) * (1 - grad) + np.array(bottom, dtype=np.float32) * grad
    ).astype(np.uint8)
    arr = np.repeat(arr, size, axis=1)
    tile = Image.fromarray(arr, "RGB").convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * CORNER_RADIUS_RATIO), fill=255
    )
    tile.putalpha(mask)
    return tile


def compose(whale: Image.Image, tile_top, tile_bottom, whale_color) -> Image.Image:
    """在 RENDER_SIZE 母版上合成一个变体。"""
    size = RENDER_SIZE
    tile = rounded_tile(size, tile_top, tile_bottom)
    target_w = int(size * WHALE_FILL_RATIO)
    scale = target_w / whale.width
    w = whale.resize((target_w, round(whale.height * scale)), Image.LANCZOS)
    # 重新着色：鲸鱼剪影为白色 + alpha，叠一层纯色。
    tint = Image.new("RGBA", w.size, (*whale_color, 255))
    tint.putalpha(w.getchannel("A"))
    x = (size - w.width) // 2
    y = (size - w.height) // 2
    tile.alpha_composite(tint, (x, y))
    return tile


def emit_iconset(master: Image.Image, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for f in dest.glob("*.png"):
        f.unlink()
    for points in ICON_POINTS[0]:
        for scale in ICON_POINTS[1]:
            px = points * scale
            name = f"icon_{points}x{points}.png" if scale == 1 else f"icon_{points}x{points}@2x.png"
            master.resize((px, px), Image.LANCZOS).save(dest / name)


def main(argv: list[str]) -> int:
    variant = argv[1] if len(argv) > 1 else "slate"
    if variant not in VARIANTS:
        print(f"make-icons: unknown variant {variant!r}; choose from {', '.join(VARIANTS)}", file=sys.stderr)
        return 2
    tile_top, tile_bottom, whale_color = VARIANTS[variant]
    master = compose(extract_whale(), tile_top, tile_bottom, whale_color)
    master.resize((512, 512), Image.LANCZOS).save(ICONS / "preview.png")
    emit_iconset(master, ICONS / "DSH Open.iconset")
    print(f"icons written under {ICONS} (variant: {variant})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
