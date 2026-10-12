"""Builds the side-by-side comparison strip (three 1280x720 thumbnails + labels)."""
from PIL import Image, ImageDraw, ImageFont

BASE = r"C:\Users\jesse\OneDrive\Documenten\Assistara Academy\youtube-thumbnails"
HEADER = 64
TW, TH = 1280, 720
SEP = 2

labels = [
    ("01-editorial.png", "01  ·  EDITORIAL", "Magazine layout · ink panel · marker highlight"),
    ("02-cinematic.png", "02  ·  CINEMATIC", "Dramatic lighting · depth · keyword glow"),
    ("03-minimalist.png", "03  ·  MINIMALIST", "Editorial geometry · intentional negative space"),
]

W = TW * 3 + SEP * 2
H = HEADER + TH
canvas = Image.new("RGB", (W, H), "#F6F4EF")
draw = ImageDraw.Draw(canvas)

f_label = ImageFont.truetype(f"{BASE}/assets/fonts/manrope-variable.ttf", 22)
f_sub = ImageFont.truetype(f"{BASE}/assets/fonts/manrope-variable.ttf", 15)
f_axis = ImageFont.truetype(f"{BASE}/assets/fonts/manrope-variable.ttf", 13)

for i, (fname, label, sub) in enumerate(labels):
    x0 = i * (TW + SEP)
    thumb = Image.open(f"{BASE}/out/{fname}").convert("RGB")
    canvas.paste(thumb, (x0, HEADER))
    # label block (centered in its third)
    cx = x0 + TW / 2
    bbox = draw.textbbox((0, 0), label, font=f_label)
    lw = bbox[2] - bbox[0]
    draw.text((cx - lw / 2, 14), label, font=f_label, fill="#151515")
    bbox = draw.textbbox((0, 0), sub, font=f_sub)
    sw = bbox[2] - bbox[0]
    draw.text((cx - sw / 2, 42), sub, font=f_sub, fill="#8A857D")
    # separator
    if i > 0:
        draw.rectangle([x0 - SEP, 0, x0 - 1, H], fill="#E4E0D6")

# axis labels
draw.text((0, H - 0), "", font=f_axis, fill="#8A857D")

canvas.save(f"{BASE}/out/comparison.png", "PNG", optimize=True)
print(f"comparison.png: {W}x{H}")
