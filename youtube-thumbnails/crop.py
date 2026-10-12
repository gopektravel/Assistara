"""Crops the browser viewport screenshot to the 1280x720 stage area and
downsamples (LANCZOS) to exactly 1280x720. Supersampled render => crisp text."""
import sys
from PIL import Image

inp, outp, dpr, vw, vh = sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
STAGE_W, STAGE_H = 1280, 720

img = Image.open(inp).convert("RGB")
w, h = img.size
crop_w = min(int(STAGE_W * dpr), w)
crop_h = min(int(STAGE_H * dpr), h)
img = img.crop((0, 0, crop_w, crop_h))
img = img.resize((STAGE_W, STAGE_H), Image.LANCZOS)
img.save(outp, "PNG", optimize=True)
print(f"{outp}: {w}x{h} -> crop {crop_w}x{crop_h} -> 1280x720")
