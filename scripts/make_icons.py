#!/usr/bin/env python3
"""
Home Church, app icon generator.

WHY THIS EXISTS. Apple rejects app icons that contain an alpha channel, even
when nothing in them is actually transparent, which was the case here: all four
icon PNGs were RGBA with every pixel fully opaque. That made stripping the
channel lossless, but it still had to happen, and it has to keep happening
every time the icon is redrawn. So it is a script rather than a one time fix.

WHAT IT DOES NOT TOUCH. assets/icons/mark.png and both logo lockups use
transparency for real, around 70 to 80 percent non-opaque, because they sit on
the paper background and on dark panels. Flattening those would put a box
around the church's logo. This script only ever reads the square icon source.

USAGE
    python3 scripts/make_icons.py

    Needs Pillow:  pip install Pillow

    Writes the full iOS AppIcon set to ios-icons/, plus refreshed web icons in
    assets/icons/. Safe to re-run.

A NOTE ON THE 1024. The largest square source in this repo is 512x512, so the
App Store marketing icon is upscaled. That is acceptable and it is not ideal.
If the church's original logo file still exists as vector art, export a real
1024x1024 from it and drop it in as assets/icons/icon-1024.png, which this
script prefers over upscaling when it is present.
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed. Run: pip install Pillow")


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'assets', 'icons')
OUT = os.path.join(ROOT, 'ios-icons')

# The warm dark the icon is already drawn on. Used only if a future source
# arrives with real transparency, so the flatten has something to sit on
# rather than defaulting to white.
BACKDROP = (26, 25, 24)

# iOS AppIcon set. (pixel size, filename). Xcode 14 and later accept a single
# 1024 and generate the rest, but shipping the full set costs nothing and works
# with every project layout, including older ones.
IOS_SIZES = [
    (40,   'icon-20@2x.png'),        # iPhone notification
    (60,   'icon-20@3x.png'),
    (58,   'icon-29@2x.png'),        # iPhone settings
    (87,   'icon-29@3x.png'),
    (80,   'icon-40@2x.png'),        # iPhone spotlight
    (120,  'icon-40@3x.png'),
    (120,  'icon-60@2x.png'),        # iPhone app
    (180,  'icon-60@3x.png'),
    (20,   'icon-20.png'),           # iPad
    (29,   'icon-29.png'),
    (76,   'icon-76.png'),
    (152,  'icon-76@2x.png'),
    (167,  'icon-83.5@2x.png'),      # iPad Pro
    (1024, 'icon-1024.png'),         # App Store marketing
]

# The PWA and browser icons. Same treatment, because there is no reason for
# these to carry a channel they do not use either.
WEB_SIZES = [
    (64,  'favicon.png'),
    (180, 'apple-touch-icon-180.png'),
    (192, 'icon-192.png'),
    (512, 'icon-512.png'),
]


def load_source():
    """Prefer a real 1024 if somebody has exported one from the source art."""
    best = os.path.join(ICONS, 'icon-1024.png')
    if os.path.exists(best):
        print('source: icon-1024.png (real, not upscaled)')
        return Image.open(best).convert('RGBA')

    src = os.path.join(ICONS, 'icon-512.png')
    if not os.path.exists(src):
        sys.exit('No icon source found. Expected assets/icons/icon-512.png')
    print('source: icon-512.png (the 1024 will be upscaled, see the note in this file)')
    return Image.open(src).convert('RGBA')


def flatten(img):
    """RGBA to RGB. Composites onto BACKDROP so a source that does use
    transparency lands on the icon's own dark rather than on white."""
    ground = Image.new('RGB', img.size, BACKDROP)
    ground.paste(img, mask=img.split()[3])
    return ground


def write(img, size, path):
    out = img.resize((size, size), Image.LANCZOS) if img.size != (size, size) else img.copy()
    out.save(path, 'PNG', optimize=True)
    return os.path.getsize(path)


def main():
    src = load_source()
    flat = flatten(src)

    os.makedirs(OUT, exist_ok=True)

    print('\niOS AppIcon set, ios-icons/')
    for size, name in IOS_SIZES:
        n = write(flat, size, os.path.join(OUT, name))
        print(f'  {name:22} {size:>4}px  {n/1024:6.1f} KB')

    print('\nWeb icons, assets/icons/')
    for size, name in WEB_SIZES:
        n = write(flat, size, os.path.join(ICONS, name))
        print(f'  {name:22} {size:>4}px  {n/1024:6.1f} KB')

    print('\nEvery file above is RGB with no alpha channel.')
    print('Drag ios-icons/ into the AppIcon set in Xcode, or point the')
    print('AppIcon.appiconset Contents.json at these filenames.')


if __name__ == '__main__':
    main()
