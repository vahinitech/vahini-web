#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
"""Generate the 1200x630 Open Graph cards under site/assets/og/.

Every page that gets shared on WhatsApp, LinkedIn or X needs one of these.
The layout, colours and geometry were measured off the existing hand-made
cards (site/assets/og/product.png was the reference) so newly generated
cards sit in the same family as the ones already shipped:

    15px teal rule down the left edge
    dark slate ground, warming very slightly towards teal on the right
    teal eyebrow, serif headline, muted sans sub-line, teal domain footer
    the round Vahini mark, 96px, top right

Only pages listed in CARDS below are generated; the pre-existing cards are
NOT regenerated, so this script cannot quietly restyle artwork someone
made by hand. Run:  python3 tools/gen-og-images.py
"""

import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

W, H = 1200, 630

BAR_W = 15
BAR = (0, 173, 181)            # #00adb5
BG_L = (30, 35, 43)            # #1e232b
BG_R = (24, 49, 56)            # #183138 - the faint teal cast on the right
TEAL = (63, 208, 214)          # #3fd0d6  eyebrow + footer
INK = (238, 240, 244)          # #eef0f4  headline
MUTED = (150, 160, 172)        # #96a0ac  sub-line

MARGIN_X = 85
LOGO_BOX = (1030, 64, 96)      # left, top, size

# DejaVu ships with the sandbox and with most CI images. The site itself sets
# Spectral/Hanken Grotesk, which are Google-hosted and not vendored here; the
# pairing (serif headline over sans support text) is what carries the look, and
# DejaVu holds it. Swap these paths if the brand faces are ever vendored.
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
F_HEAD = os.path.join(FONT_DIR, "DejaVuSerif-Bold.ttf")
F_BOLD = os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")
F_BODY = os.path.join(FONT_DIR, "DejaVuSans.ttf")

# eyebrow, headline, sub-line. Wording is lifted from each page's own H1 and
# meta description - these cards must not make claims the page does not.
CARDS = {
    "index": ("VAHINI · MOTION INTELLIGENCE",
              "Pens recorded ink. Now they record intelligence.",
              "AI handwriting analysis from a patented sensor pen."),
    "awards": ("VAHINI · AWARDS",
               "We won the DeepTech Innovation Award",
               "Andhra Pradesh Digital Technology Summit 2026."),
    "benchmarks": ("VAHINI · BENCHMARKS",
                   "The pen, measured.",
                   "What it captures, how long it writes, how fast it charges."),
    "events": ("VAHINI · EVENTS",
               "Where we've shown Vahini",
               "Expos and demo days for the dual-IMU sensor pen."),
    "investor": ("VAHINI · INVESTORS",
                 "The motion-data moat",
                 "The dataset thesis, the demo, the patents and the ask."),
    "licenses": ("VAHINI · LICENSES",
                 "Credited openly",
                 "Open-source attribution and the SPDX bill of materials."),
    "patents": ("VAHINI · PATENTS",
                "Protected at the hardware and signal layer",
                "Indian patent 584433 granted, plus filed applications."),
    "pitch-deck": ("VAHINI · PITCH DECK",
                   "The Vahini pitch deck",
                   "A patented sensor pen and the 20-factor report."),
    "press": ("VAHINI · PRESS",
              "Vahini in print",
              "Newspaper and magazine coverage of the sensor pen."),
    "privacy": ("VAHINI · PRIVACY",
                "Data Privacy Statement",
                "What we collect, how we protect it, your DPDP rights."),
    "reach": ("VAHINI · CONTACT",
              "Help build the pen",
              "Partnerships, pilots, research, pre-orders and press."),
    "resources": ("VAHINI · RESOURCES",
                  "Everything to write, and read, better",
                  "The 20 factors, practice sheets, guides and the blog."),
    "terms": ("VAHINI · TERMS",
              "Terms of Use",
              "IP, your uploads, acceptable use and governing law."),
    "updates": ("VAHINI · UPDATES",
                "News, research & recognition",
                "Announcements, research notes and awards."),
    "blog": ("VAHINI · BLOG",
             "Notes from the handwriting frontier",
             "Plain-language writing on motion, sensing and handwriting."),
}


def ground():
    """Dark slate with the faint left-to-right teal cast, drawn per column."""
    img = Image.new("RGB", (W, H), BG_L)
    d = ImageDraw.Draw(img)
    for x in range(W):
        # ease-in so the cast stays invisible until the right third, matching
        # the reference card rather than reading as a flat linear ramp
        t = (x / (W - 1)) ** 2.2
        d.line([(x, 0), (x, H)],
               fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_L, BG_R)))
    d.rectangle([0, 0, BAR_W - 1, H], fill=BAR)
    return img


def wrap(draw, text, font, max_w):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def render(name, eyebrow, headline, sub, mark, out_dir):
    img = ground()
    d = ImageDraw.Draw(img)
    avail = W - MARGIN_X - 150          # keep clear of the logo column

    if mark:
        lx, ly, ls = LOGO_BOX
        img.paste(mark.resize((ls, ls), Image.LANCZOS), (lx, ly),
                  mark.resize((ls, ls), Image.LANCZOS))

    d.text((MARGIN_X, 150), eyebrow, font=ImageFont.truetype(F_BOLD, 26),
           fill=TEAL)

    # Shrink the headline until it fits three lines - long page names must not
    # silently overflow the card.
    for size in range(78, 37, -3):
        f = ImageFont.truetype(F_HEAD, size)
        lines = wrap(d, headline, f, avail)
        if len(lines) <= 3:
            break
    lh = int(size * 1.25)
    y = 205
    for ln in lines:
        d.text((MARGIN_X, y), ln, font=f, fill=INK)
        y += lh

    fs = ImageFont.truetype(F_BODY, 28)
    for ln in wrap(d, sub, fs, avail)[:2]:
        d.text((MARGIN_X, min(y + 18, 500)), ln, fill=MUTED, font=fs)
        y += 38

    d.text((MARGIN_X, 565), "vahinitech.com",
           font=ImageFont.truetype(F_BOLD, 26), fill=TEAL)

    path = os.path.join(out_dir, f"{name}.png")
    img.save(path, optimize=True)
    return path


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "site", "assets", "og")
    mark_path = os.path.join(root, "site", "assets", "ev", "vahini-mark.png")
    mark = Image.open(mark_path).convert("RGBA") if os.path.exists(mark_path) else None
    if mark is None:
        print(f"warning: {mark_path} missing, cards will have no logo")

    made = 0
    for name, (eyebrow, headline, sub) in CARDS.items():
        path = os.path.join(out_dir, f"{name}.png")
        if os.path.exists(path):
            print(f"skip (exists, hand-made): {os.path.relpath(path, root)}")
            continue
        print("wrote:", os.path.relpath(render(name, eyebrow, headline, sub,
                                               mark, out_dir), root))
        made += 1
    print(f"\n{made} card(s) generated, {len(CARDS) - made} skipped")


if __name__ == "__main__":
    main()
