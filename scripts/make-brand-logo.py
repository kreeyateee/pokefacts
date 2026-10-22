"""Cut the supplied Pokefacts lockup into transparent vertical and horizontal PNGs."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "brand" / "source.jpg"
OUT = ROOT / "public" / "brand"


def is_paper(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return r >= 226 and g >= 226 and b >= 226 and max(r, g, b) - min(r, g, b) <= 22


def knock_out(src: Image.Image) -> Image.Image:
    rgb = src.convert("RGB")
    w, h = rgb.size
    pixels = rgb.load()
    alpha = bytearray(w * h)
    seen = bytearray(w * h)
    queue: deque[int] = deque()

    def push(x: int, y: int) -> None:
        i = y * w + x
        if seen[i]:
            return
        if not is_paper(pixels[x, y]):
            return
        seen[i] = 1
        queue.append(i)

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while queue:
        i = queue.popleft()
        x, y = i % w, i // w
        if x:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)

    out = Image.new("RGBA", (w, h))
    dest = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            dest[x, y] = (r, g, b, 0 if seen[y * w + x] else 255)
    return out


def content_box(im: Image.Image, pad: int = 8) -> tuple[int, int, int, int]:
    alpha = im.split()[-1]
    box = alpha.getbbox()
    if not box:
        return (0, 0, im.width, im.height)
    left, top, right, bottom = box
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(im.width, right + pad),
        min(im.height, bottom + pad),
    )


def crop(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return im.crop(box)


def row_has_ink(im: Image.Image, y: int, step: int = 2) -> bool:
    px = im.load()
    w = im.width
    for x in range(0, w, step):
        if px[x, y][3] > 24:
            return True
    return False


def bands(im: Image.Image, gap: int = 12) -> list[tuple[int, int]]:
    rows = [y for y in range(im.height) if row_has_ink(im, y)]
    if not rows:
        return []
    found: list[tuple[int, int]] = []
    start = prev = rows[0]
    for y in rows[1:]:
        if y > prev + gap:
            found.append((start, prev + 1))
            start = y
        prev = y
    found.append((start, prev + 1))
    return found


def col_has_ink(im: Image.Image, x: int, y0: int, y1: int, step: int = 2) -> bool:
    px = im.load()
    for y in range(y0, y1, step):
        if px[x, y][3] > 24:
            return True
    return False


def band_box(im: Image.Image, y0: int, y1: int, pad: int = 6) -> tuple[int, int, int, int]:
    xs = [x for x in range(im.width) if col_has_ink(im, x, y0, y1)]
    left, right = (xs[0], xs[-1] + 1) if xs else (0, im.width)
    return (
        max(0, left - pad),
        max(0, y0 - pad),
        min(im.width, right + pad),
        min(im.height, y1 + pad),
    )


def fit(im: Image.Image, height: int) -> Image.Image:
    if im.height == height:
        return im
    width = max(1, round(im.width * (height / im.height)))
    return im.resize((width, height), Image.Resampling.LANCZOS)


def paste(canvas: Image.Image, piece: Image.Image, x: int, y: int) -> None:
    canvas.alpha_composite(piece, (x, y))


def down(im: Image.Image, longest: int) -> Image.Image:
    current = max(im.size)
    if current <= longest:
        return im
    scale = longest / current
    return im.resize(
        (max(1, round(im.width * scale)), max(1, round(im.height * scale))),
        Image.Resampling.LANCZOS,
    )


def save(im: Image.Image, name: str, dest: Path | None = None) -> None:
    path = (dest or OUT) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"{name} {im.size[0]}x{im.size[1]} {path.stat().st_size} bytes")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    knocked = knock_out(Image.open(SOURCE))
    parts = bands(knocked)
    if len(parts) < 3:
        raise SystemExit(f"expected wordmark, device, tagline; got {parts}")

    word = crop(knocked, band_box(knocked, *parts[0], pad=10))
    mark = crop(knocked, band_box(knocked, *parts[1], pad=10))
    tag_y0 = parts[2][0]
    tag_y1 = parts[-1][1]
    tag = crop(knocked, band_box(knocked, tag_y0, tag_y1, pad=10))

    vertical_pad = 28
    gap_word = 28
    gap_tag = 36
    stack_w = max(word.width, mark.width, tag.width) + vertical_pad * 2
    stack_h = vertical_pad + word.height + gap_word + mark.height + gap_tag + tag.height + vertical_pad
    vertical = Image.new("RGBA", (stack_w, stack_h), (0, 0, 0, 0))
    paste(vertical, word, (stack_w - word.width) // 2, vertical_pad)
    paste(vertical, mark, (stack_w - mark.width) // 2, vertical_pad + word.height + gap_word)
    paste(vertical, tag, (stack_w - tag.width) // 2, vertical_pad + word.height + gap_word + mark.height + gap_tag)
    vertical = crop(vertical, content_box(vertical, pad=12))

    # Horizontal: device left, wordmark + tagline stacked right.
    mark_h = max(word.height + 28 + tag.height, 420)
    mark_h = min(mark_h, mark.height)
    side = fit(mark, mark_h)
    text_h = word.height + 24 + tag.height
    if text_h > side.height:
        scale = side.height / text_h
        word_h = fit(word, max(1, round(word.height * scale)))
        tag_h = fit(tag, max(1, round(tag.height * scale)))
    else:
        word_h = word
        tag_h = tag
    gap = 36
    pad = 20
    text_w = max(word_h.width, tag_h.width)
    horiz_w = pad + side.width + gap + text_w + pad
    horiz_h = pad + max(side.height, word_h.height + 24 + tag_h.height) + pad
    horizontal = Image.new("RGBA", (horiz_w, horiz_h), (0, 0, 0, 0))
    side_y = pad + (horiz_h - 2 * pad - side.height) // 2
    text_x = pad + side.width + gap
    text_block_h = word_h.height + 24 + tag_h.height
    text_y = pad + (horiz_h - 2 * pad - text_block_h) // 2
    paste(horizontal, side, pad, side_y)
    paste(horizontal, word_h, text_x + (text_w - word_h.width) // 2, text_y)
    paste(horizontal, tag_h, text_x + (text_w - tag_h.width) // 2, text_y + word_h.height + 24)
    horizontal = crop(horizontal, content_box(horizontal, pad=8))

    compact_mark = fit(mark, 220)
    compact_word = fit(word, 150)
    compact_gap = 28
    compact_pad = 12
    compact_h = compact_pad * 2 + max(compact_mark.height, compact_word.height)
    compact_w = compact_pad * 2 + compact_mark.width + compact_gap + compact_word.width
    compact = Image.new("RGBA", (compact_w, compact_h), (0, 0, 0, 0))
    paste(compact, compact_mark, compact_pad, compact_pad + (compact_h - 2 * compact_pad - compact_mark.height) // 2)
    paste(
        compact,
        compact_word,
        compact_pad + compact_mark.width + compact_gap,
        compact_pad + (compact_h - 2 * compact_pad - compact_word.height) // 2,
    )
    compact = crop(compact, content_box(compact, pad=6))

    og = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
    fitted = vertical.copy()
    og_scale = min(460 / fitted.width, 460 / fitted.height)
    fitted = fitted.resize(
        (max(1, round(fitted.width * og_scale)), max(1, round(fitted.height * og_scale))),
        Image.Resampling.LANCZOS,
    )
    og.alpha_composite(fitted, ((512 - fitted.width) // 2, (512 - fitted.height) // 2))

    icon_box = 192
    icon = Image.new("RGBA", (icon_box, icon_box), (0, 0, 0, 0))
    icon_mark = fit(mark, 164)
    icon.alpha_composite(icon_mark, ((icon_box - icon_mark.width) // 2, (icon_box - icon_mark.height) // 2))

    app = ROOT / "src" / "app"
    save(down(vertical, 900), "logo-vertical.png")
    save(down(horizontal, 1200), "logo-horizontal.png")
    save(down(compact, 800), "logo-compact.png")
    save(down(mark, 360), "logo-mark.png")
    save(og.convert("RGB"), "opengraph-image.png", app)
    save(og.convert("RGB"), "twitter-image.png", app)
    save(icon, "icon.png", app)


if __name__ == "__main__":
    main()
