"""Build public/logo.png, public/logo-mark.png and src/app/icon.png from the cleaned brand file.
Usage: python scripts/build-logo.py
Source: content/brand/sav-prime-logo-transparent.png (real alpha, checkerboard RGB still sits under it)."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = "content/brand/sav-prime-logo-transparent.png"
CELL = 30  # checker cell size in the source, px

im = np.asarray(Image.open(SRC).convert("RGBA"))
rgb = im[:, :, :3].astype(np.int16)
alpha = im[:, :, 3] > 0
v = rgb.mean(axis=2)

# The mark sits left of the first fully empty column run.
empty = np.where(alpha.sum(axis=0) == 0)[0]
cut = int(empty[0])
ys, xs = np.where(alpha[:, :cut])
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
r = min(xs.max() - xs.min(), ys.max() - ys.min()) / 2
yy, xx = np.mgrid[: im.shape[0], : im.shape[1]]
disc = (xx - cx) ** 2 + (yy - cy) ** 2 < (r * 0.93) ** 2

# The cleaned file dropped the pale highlights of the grey ribbon along with the checkerboard.
# Checkerboard has a hard tone step every CELL px; a highlight is smooth. Recover the smooth parts.
step = np.hypot(ndi.sobel(v, axis=0), ndi.sobel(v, axis=1)) > 60
far = ndi.distance_transform_edt(~step) > CELL / 2 + 4
smooth = ndi.binary_dilation(far, iterations=CELL // 2 + 3) & ~alpha & disc
# Keep only recovered pieces that touch the artwork and are big enough to be a highlight.
lab, n = ndi.label(smooth)
idx = np.arange(1, n + 1)
area = ndi.sum(smooth, lab, idx)
touch = ndi.sum(ndi.binary_dilation(alpha, iterations=3) & smooth, lab, idx)
keep = np.isin(lab, idx[(area > 1500) & (touch > 40)])
alpha = alpha | keep
print("highlight px recovered:", int(keep.sum()))

# Pull the edge in 1px so no checker-coloured fringe survives, then soften for clean downscaling.
a = ndi.binary_erosion(alpha, iterations=1).astype(np.float32)
a = np.clip(ndi.gaussian_filter(a, 0.8), 0, 1)
out = Image.fromarray(np.dstack([im[:, :, :3], (a * 255).astype(np.uint8)]), "RGBA")


def fit(img, width=None, height=None):
    img = img.crop(img.getbbox())
    if width:
        size = (width, round(img.height * width / img.width))
    else:
        size = (round(img.width * height / img.height), height)
    return img.resize(size, Image.LANCZOS)


def save(img, path, colours=None):
    if colours:
        img = img.quantize(colours, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    img.save(path, optimize=True)


logo = fit(out, width=960)
save(logo, "public/logo.png")

mark_src = out.crop((0, 0, cut, out.height))
mark = fit(mark_src, height=320)
save(mark, "public/logo-mark.png")

# Square favicon / app icon from the mark.
icon = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
m = fit(mark_src, height=244)
if m.width > 256:
    m = fit(mark_src, width=256)
icon.alpha_composite(m, ((256 - m.width) // 2, (256 - m.height) // 2))
save(icon, "src/app/icon.png")

# Light lockup for the dark ground: the mark is untouched, the divider and wordmark turn near-white.
light = np.asarray(out).copy()
light[:, cut:, :3] = (244, 247, 250)
save(fit(Image.fromarray(light, "RGBA"), width=960), "public/logo-light.png")

print("logo", logo.size, "mark", mark.size)

# Proof sheets on the site's ground colours.
for name, col, src in (("paper", (246, 247, 248), "logo"), ("navy", (7, 13, 23), "logo-light")):
    lg = Image.open(f"public/{src}.png").convert("RGBA")
    mk = Image.open("public/logo-mark.png").convert("RGBA")
    sheet = Image.new("RGBA", (lg.width + mk.width + 120, max(lg.height, mk.height) + 80), col + (255,))
    sheet.alpha_composite(lg, (40, 40))
    sheet.alpha_composite(mk, (lg.width + 80, 40))
    sheet.convert("RGB").save(f"scripts/logo-proof-{name}.png")
