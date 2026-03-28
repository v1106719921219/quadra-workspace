"""顧客サーバー用アイコン自動生成（Pillow）"""

import io
import os
import re
import random
from PIL import Image, ImageDraw, ImageFont

JAPANESE_FONT_PATHS = [
    # プロジェクト同梱フォント（最優先）
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts", "NotoSansCJKjp-Bold.otf"),
    # macOS
    "/System/Library/Fonts/ヒラギノ角ゴシック W9.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    # Nix (Railway/nixpacks)
    "/run/current-system/sw/share/X11/fonts/NotoSansCJK-Bold.ttc",
    "/run/current-system/sw/share/X11/fonts/NotoSansCJKjp-Bold.otf",
    # Linux (apt)
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJKjp-Bold.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    # Generic fallback
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _load_japanese_font(size: int) -> ImageFont.FreeTypeFont:
    for path in JAPANESE_FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


CORP_PREFIXES = re.compile(r"^(合同会社|株式会社|有限会社|一般社団法人|一般財団法人)")
CORP_SUFFIXES = re.compile(r"(合同会社|株式会社|有限会社|一般社団法人|一般財団法人)$")

BG_COLORS = [
    "#4338ca",  # indigo
    "#7c3aed",  # violet
    "#2563eb",  # blue
    "#0891b2",  # cyan
    "#059669",  # emerald
    "#d97706",  # amber
    "#dc2626",  # red
    "#db2777",  # pink
    "#9333ea",  # purple
    "#0d9488",  # teal
]

SIZE = 512
CHARS_PER_LINE = 2


def generate_server_icon(customer_name: str) -> bytes:
    """
    512x512のサーバーアイコンを生成。
    1行2-3文字で大きく表示、背景色ランダム。
    """
    bg_color = random.choice(BG_COLORS)

    # 背景レイヤー
    img = Image.new("RGBA", (SIZE, SIZE), bg_color)

    # Qウォーターマークを別レイヤーで描画して合成
    q_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    q_draw = ImageDraw.Draw(q_layer)
    font_q = _load_japanese_font(420)
    q_draw.text(
        (SIZE // 2, SIZE // 2),
        "Q",
        fill=(255, 255, 255, 60),
        font=font_q,
        anchor="mm",
    )
    img = Image.alpha_composite(img, q_layer)
    draw = ImageDraw.Draw(img)

    # 法人格を除去
    short_name = CORP_PREFIXES.sub("", customer_name).strip()
    short_name = CORP_SUFFIXES.sub("", short_name).strip()
    if not short_name:
        short_name = customer_name[:6]

    # 1行あたりの文字数を決定（3〜5文字）
    name_len = len(short_name)
    if name_len <= 5:
        chars_per_line = name_len  # 1行に収まる
    elif name_len <= 6:
        chars_per_line = 3
    else:
        chars_per_line = 4

    # 行に分割
    lines = []
    for i in range(0, name_len, chars_per_line):
        lines.append(short_name[i:i + chars_per_line])

    # フォントサイズを文字数・行数に応じて調整
    max_chars = max(len(line) for line in lines)
    num_lines = len(lines)
    if max_chars <= 3:
        font_size = 150
    elif max_chars <= 4:
        font_size = 120
    else:
        font_size = 100

    # 行数が多い場合は縮小
    if num_lines >= 4:
        font_size = min(font_size, 90)
    elif num_lines >= 3:
        font_size = min(font_size, 110)

    font = _load_japanese_font(font_size)

    # 行の高さを計算
    line_height = font_size + 10
    total_height = line_height * len(lines)
    start_y = (SIZE - total_height) // 2 + font_size // 2

    # 各行を中央に描画
    for i, line in enumerate(lines):
        y = start_y + i * line_height
        draw.text(
            (SIZE // 2, y),
            line,
            fill="white",
            font=font,
            anchor="mm",
        )

    out = img.convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
