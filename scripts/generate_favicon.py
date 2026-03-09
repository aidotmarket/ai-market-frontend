#!/usr/bin/env python3
"""Generate ai.market favicon in SVG, PNG, and ICO formats."""

from PIL import Image, ImageDraw, ImageFont
import struct
import io
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

# --- SVG favicon ---
SVG = '''\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <text x="32" y="44" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif"
        font-size="30" font-weight="700" fill="white" letter-spacing="-1">ai</text>
</svg>
'''

with open(os.path.join(OUT, 'favicon.svg'), 'w') as f:
    f.write(SVG.strip())
print('wrote favicon.svg')


def render_icon(size: int) -> Image.Image:
    """Render the favicon at the given size using Pillow."""
    scale = 4  # render at 4x then downscale for antialiasing
    s = size * scale
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rect background (approximate with ellipses at corners)
    r = s * 14 // 64  # corner radius proportional to 14/64
    # Fill main rect areas
    draw.rectangle([r, 0, s - r, s], fill='#2563EB')
    draw.rectangle([0, r, s, s - r], fill='#2563EB')
    draw.ellipse([0, 0, r * 2, r * 2], fill='#2563EB')
    draw.ellipse([s - r * 2, 0, s, r * 2], fill='#2563EB')
    draw.ellipse([0, s - r * 2, r * 2, s], fill='#2563EB')
    draw.ellipse([s - r * 2, s - r * 2, s, s], fill='#2563EB')

    # Apply a simple gradient overlay (top-left blue to bottom-right indigo)
    gradient = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(gradient)
    for y in range(s):
        t = y / s
        # interpolate from #2563EB to #4F46E5
        cr = int(37 + (79 - 37) * t)
        cg = int(99 + (70 - 99) * t)
        cb = int(235 + (229 - 235) * t)
        gdraw.line([(0, y), (s, y)], fill=(cr, cg, cb, 255))
    # Use the icon shape as mask for gradient
    mask = img.split()[3]
    gradient.putalpha(mask)
    img = gradient

    # Draw "ai" text
    font_size = int(s * 30 / 64)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), "ai", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (s - tw) // 2 - bbox[0]
    ty = (s - th) // 2 - bbox[1] - int(s * 0.02)
    draw.text((tx, ty), "ai", fill='white', font=font)

    # Downscale with antialiasing
    return img.resize((size, size), Image.LANCZOS)


# --- PNG versions ---
img32 = render_icon(32)
img32.save(os.path.join(OUT, 'favicon.png'), 'PNG')
print('wrote favicon.png (32x32)')

img180 = render_icon(180)
img180.save(os.path.join(OUT, 'apple-touch-icon.png'), 'PNG')
print('wrote apple-touch-icon.png (180x180)')

# --- ICO version (contains 16, 32, 48) ---
img16 = render_icon(16)
img48 = render_icon(48)
img32.save(
    os.path.join(OUT, 'favicon.ico'),
    format='ICO',
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=[img16, img48],
)
print('wrote favicon.ico')

print('done!')
