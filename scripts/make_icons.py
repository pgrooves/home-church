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

    python3 scripts/make_icons.py --android

    Writes only the Android launcher icons, into android/app/src/main/res/,
    and touches nothing the iOS or web builds read. Those are committed,
    because android/ is (see the README's Android section).

ANDROID IS DRAWN, NOT RESIZED. Android 8 and later mask the launcher icon to
whatever shape the phone's maker chose, circle, squircle or teardrop, and the
mask can cut a third off each edge. Shrinking the iOS square would put the
house's roof under that cut. So the adaptive icon is two layers: the warm dark
as a flat background colour, and the mark alone on transparency, sized so its
corners stay inside the 66dp circle Google guarantees is never masked. Older
phones get the same composition flattened, square and round.

A NOTE ON THE 1024. The largest square source in this repo is 512x512, so the
App Store marketing icon is upscaled. That is acceptable and it is not ideal.
If the church's original logo file still exists as vector art, export a real
1024x1024 from it and drop it in as assets/icons/icon-1024.png, which this
script prefers over upscaling when it is present.
"""

import os
import sys

try:
    from PIL import Image, ImageDraw
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


# Android launcher densities, (folder suffix, legacy icon px). The adaptive
# foreground is 108dp to the legacy icon's 48dp, so 2.25 times each.
ANDROID_DENSITIES = [
    ('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192),
]
ANDROID_RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

# The mark's width as a share of the 108dp canvas. Its diagonal has to fit the
# 66dp safe circle: 66/108 of the canvas, times its width over its diagonal
# (246 over 334), is 0.45. A hair under, so antialiasing cannot cross it.
MARK_SHARE = 0.44


def mark_on(canvas, share, ground=None):
    """The transparent mark, centred on a square canvas, `share` of its width."""
    mark = Image.open(os.path.join(ICONS, 'mark.png')).convert('RGBA')
    w = round(canvas * share)
    h = round(mark.height * w / mark.width)
    mark = mark.resize((w, h), Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), ground + (255,) if ground else (0, 0, 0, 0))
    out.alpha_composite(mark, ((canvas - w) // 2, (canvas - h) // 2))
    return out


def android():
    print('Android launcher icons, android/app/src/main/res/')
    for density, size in ANDROID_DENSITIES:
        folder = os.path.join(ANDROID_RES, 'mipmap-' + density)
        os.makedirs(folder, exist_ok=True)
        fg = round(size * 2.25)
        mark_on(fg, MARK_SHARE).save(os.path.join(folder, 'ic_launcher_foreground.png'), 'PNG', optimize=True)

        # Pre-adaptive phones, Android 7: the same composition, cropped the
        # way the adaptive one would be, to a square and to a circle.
        legacy = mark_on(fg, MARK_SHARE, BACKDROP).crop((round(fg * 18 / 108),) * 2 + (round(fg * 90 / 108),) * 2)
        legacy = legacy.resize((size, size), Image.LANCZOS)
        legacy.convert('RGB').save(os.path.join(folder, 'ic_launcher.png'), 'PNG', optimize=True)
        round_mask = Image.new('L', (size * 4, size * 4), 0)
        ImageDraw.Draw(round_mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        rounded = legacy.copy()
        rounded.putalpha(round_mask.resize((size, size), Image.LANCZOS))
        rounded.save(os.path.join(folder, 'ic_launcher_round.png'), 'PNG', optimize=True)
        print(f'  mipmap-{density:8} {size:>3}px, foreground {fg}px')

    colour = '#%02X%02X%02X' % BACKDROP
    with open(os.path.join(ANDROID_RES, 'values', 'ic_launcher_background.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                f'    <color name="ic_launcher_background">{colour}</color>\n</resources>\n')
    print(f'  background {colour}')


def main():
    if '--android' in sys.argv:
        return android()

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
