from PIL import Image, ImageDraw

INDIGO = (99, 102, 241)
VIOLET = (139, 92, 246)
WHITE = (255, 255, 255, 255)


def gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))
    return img


def note_glyph(size, cx, cy, w, h):
    x0, y0 = cx - w // 2, cy - h // 2
    x1, y1 = cx + w // 2, cy + h // 2
    fold = int(w * 0.28)
    radius = int(w * 0.10)
    pts_card = [
        (x0 + radius, y0),
        (x1 - fold, y0),
        (x1 - fold, y0),
        (x1, y0 + fold),
        (x1, y1 - radius),
        (x1 - radius, y1),
        (x0 + radius, y1),
        (x0, y1 - radius),
        (x0, y0 + radius),
    ]
    return {"box": (x0, y0, x1, y1), "fold": fold, "radius": radius}


def draw_glyph(d, size, cx, cy, w, h):
    x0, y0 = cx - w // 2, cy - h // 2
    x1, y1 = cx + w // 2, cy + h // 2
    fold = int(w * 0.30)
    radius = max(2, int(w * 0.10))

    d.rounded_rectangle([x0, y0, x1, y1], radius=radius + fold // 2, fill=WHITE)
    d.polygon(
        [(x1 - fold, y0), (x1, y0 + fold), (x1 - fold, y0 + fold)],
        fill=(203, 213, 225, 255),
    )
    d.line([(x1 - fold, y0), (x1 - fold, y0 + fold), (x1, y0 + fold)], fill=(148, 163, 184, 255), width=max(2, size // 128))

    line_color = (99, 102, 241, 255)
    lw = max(3, int(w * 0.055))
    pad_x = int(w * 0.14)
    start_y = y0 + fold + int(h * 0.14)
    end_y = y1 - int(h * 0.14)
    n = 3
    gap = (end_y - start_y) / (n - 1)
    for i in range(n):
        y = int(start_y + gap * i)
        x_end = x1 - pad_x if i < n - 1 else x1 - pad_x - int(w * 0.22)
        d.rounded_rectangle([x0 + pad_x, y - lw // 2, x_end, y + lw // 2], radius=lw // 2, fill=line_color)


def make_icon(size, path, maskable=False):
    img = gradient(size, INDIGO, VIOLET)

    if maskable:
        glyph_w = int(size * 0.42)
        glyph_h = int(size * 0.50)
        draw_glyph(ImageDraw.Draw(img), size, size // 2, size // 2, glyph_w, glyph_h)
    else:
        mask = Image.new("L", (size, size), 0)
        dm = ImageDraw.Draw(mask)
        dm.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        img.putalpha(mask)
        glyph_w = int(size * 0.52)
        glyph_h = int(size * 0.62)
        draw_glyph(ImageDraw.Draw(img), size, size // 2, size // 2, glyph_w, glyph_h)

    img.save(path)
    print("wrote", path, img.size)


make_icon(192, "icons/icon-192.png")
make_icon(512, "icons/icon-512.png")
make_icon(512, "icons/maskable-512.png", maskable=True)
make_icon(180, "icons/apple-touch-icon.png", maskable=True)
