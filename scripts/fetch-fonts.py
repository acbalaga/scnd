"""Fetch Chivo and Chivo Mono, and cut peso-sign files for every face that has one. Dev-only, run once:
    python3 -m pip install fonttools brotli && python3 scripts/fetch-fonts.py

Writes to public/fonts/ (output is committed; the site never runs this):
- chivo-latin-wght-normal.woff2, chivo-mono-latin-wght-normal.woff2: Google Fonts' Latin subset, variable weight.
- <face>-peso-wght-normal.woff2: only U+20B1 (peso sign), cut from Google's latin-ext subset.
  The Latin subsets leave the peso sign out, and the full latin-ext files are 23 to 60 KB each for one glyph.
  app.css points a unicode-range: U+20B1 face at each, so the browser fetches about 1 KB when a page shows a peso.
All four families are SIL OFL 1.1; licences sit next to the files.
"""
import io, re, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/fonts'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'   # woff2 + subsets
PESO = 0x20B1

FACES = [   # (Google family query, file stem, keep the Latin subset too)
    ('Chivo:wght@100..900', 'chivo', True),
    ('Chivo+Mono:wght@100..900', 'chivo-mono', True),
    ('Source+Sans+3:wght@200..900', 'source-sans-3', False),   # Latin files already in the repo (static weights)
    ('Source+Serif+4:wght@200..900', 'source-serif-4', False),
]

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})).read()

def subset_urls(family):
    css = get(f'https://fonts.googleapis.com/css2?family={family}&display=swap').decode()
    return {m[0]: m[1] for m in re.findall(r'/\* ([\w-]+) \*/\s*@font-face \{[^}]*?src: url\((\S+?)\)', css)}

for family, stem, keep_latin in FACES:
    urls = subset_urls(family)
    if keep_latin:
        (OUT / f'{stem}-latin-wght-normal.woff2').write_bytes(get(urls['latin']))
    font = TTFont(io.BytesIO(get(urls['latin-ext'])))
    assert PESO in font.getBestCmap(), f'{stem}: no peso sign in latin-ext'
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = []; opts.name_IDs = ['*']; opts.notdef_outline = True
    sub = subset.Subsetter(opts); sub.populate(unicodes=[PESO]); sub.subset(font)
    font.flavor = 'woff2'; font.save(OUT / f'{stem}-peso-wght-normal.woff2')
    print(stem, *(f'{p.name} {p.stat().st_size} B' for p in sorted(OUT.glob(f'{stem}-*-wght-normal.woff2'))))
