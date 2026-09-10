#!/usr/bin/env python3
"""
Home Church, App Store screenshots at a second display size.

Takes screenshots that already exist, at any size, and re-cuts them to one of
Apple's exact portrait specs. Written for the 6.5 inch slot, which is what
device captures from a modern iPhone do not match on their own.

    python3 scripts/resize_screenshots.py 6.5 screenshots/*.png -o screenshots/6.5

READ THIS BEFORE YOU USE IT. Only the 6.9 inch size is required, as section 4
of SUBMISSION_KIT.md says and as `scripts/preflight.js` enforces. Apple scales
6.9 down for every smaller device on its own, and its scaler is as good as this
one. Reach for this script when you actually need a separate 6.5 inch upload,
such as a slot that is already populated with older images and will not take
the 6.9 set. Otherwise, do not: a second set is a second thing to keep honest
when the guide changes, and section 4 exists because stale screenshots are a
small lie on the store page.

Prefer `node scripts/make_screenshots.js` over this for anything it can render.
Rendering at the real logical resolution lays the page out the way the device
does; rescaling afterwards only resamples pixels that were laid out for some
other phone. This script is the fallback for images you cannot re-render.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

# Portrait pixel dimensions Apple accepts, per display slot.
SPECS = {
    "6.9": (1320, 2868),
    "6.7": (1290, 2796),
    "6.5": (1242, 2688),
    "5.5": (1242, 2208),
    "12.9": (2048, 2732),
}

# How much aspect mismatch we will absorb by cropping instead of padding.
# 6.9 to 6.5 is a 0.4% difference, which is eleven rows off a 2868 tall image
# and lands in the status bar margin. Past this, bars are the honest option.
CROP_TOLERANCE = 0.02


def edge_colour(img):
    """Average the four edges, so any padding matches the screenshot's own
    background rather than introducing a black or white band the app never
    shows. The app is near black in dark mode and off white in light."""
    w, h = img.size
    px = []
    for x in range(0, w, max(1, w // 64)):
        px.extend([img.getpixel((x, 0)), img.getpixel((x, h - 1))])
    for y in range(0, h, max(1, h // 64)):
        px.extend([img.getpixel((0, y)), img.getpixel((w - 1, y))])
    return tuple(sum(c[i] for c in px) // len(px) for i in range(3))


def convert(src, target, dest):
    tw, th = target
    img = Image.open(src)

    # Flatten alpha onto the image's own background. App Store Connect rejects
    # any screenshot carrying an alpha channel, which is the same rule
    # preflight.js checks for the 6.9 set.
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        flat = Image.new("RGB", img.size, edge_colour(img.convert("RGB")))
        flat.paste(img, mask=img.split()[-1])
        img = flat
    else:
        img = img.convert("RGB")

    sw, sh = img.size
    if abs((sw / sh) - (tw / th)) / (tw / th) <= CROP_TOLERANCE:
        # Close enough to fill the frame. Crop the sliver rather than show bars.
        scale = max(tw / sw, th / sh)
        rw, rh = round(sw * scale), round(sh * scale)
        img = img.resize((rw, rh), Image.LANCZOS)
        left, top = (rw - tw) // 2, (rh - th) // 2
        out = img.crop((left, top, left + tw, top + th))
        how = f"filled, cropped {rw - tw}x{rh - th}px"
    else:
        # Too far off to crop without eating real content, so pad instead.
        scale = min(tw / sw, th / sh)
        rw, rh = round(sw * scale), round(sh * scale)
        img = img.resize((rw, rh), Image.LANCZOS)
        out = Image.new("RGB", (tw, th), edge_colour(img))
        out.paste(img, ((tw - rw) // 2, (th - rh) // 2))
        how = f"fitted, padded {tw - rw}x{th - rh}px"

    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "PNG", optimize=True)  # nothing from the source is carried over
    return sw, sh, how


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", choices=sorted(SPECS), help='display size, e.g. "6.5"')
    ap.add_argument("sources", nargs="+", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True, help="output directory")
    args = ap.parse_args()

    target = SPECS[args.spec]
    for src in args.sources:
        if not src.is_file():
            sys.exit(f"not a file: {src}")
        dest = args.out / src.name
        sw, sh, how = convert(src, target, dest)
        print(f"{src.name}: {sw}x{sh} -> {target[0]}x{target[1]} "
              f"({how}, {dest.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
