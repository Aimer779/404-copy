"""Build the two square-pixel display digits; requires development-only fontTools."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Original geometric lettering, fitted to the reference's 5×9 digit proportions.
# VT323 remains the button font; its curved CRT outlines do not match the title.
patterns = {
    'zero': ['01110', '10001', '10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'four': ['00010', '00110', '00110', '01010', '01010', '10010', '11111', '00010', '00010'],
}
glyphs = {}
for name in ['.notdef', 'space', 'zero', 'four']:
    pen = TTGlyphPen(None)
    for row, cells in enumerate(patterns.get(name, [])):
        for col, cell in enumerate(cells):
            if cell == '0':
                continue
            left, right = round(36 + col * 65.6), round(36 + (col + 1) * 65.6)
            bottom, top = round((8 - row) * 560 / 9), round((9 - row) * 560 / 9)
            pen.moveTo((left, bottom))
            pen.lineTo((left, top))
            pen.lineTo((right, top))
            pen.lineTo((right, bottom))
            pen.closePath()
    glyphs[name] = pen.glyph()

font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(list(glyphs))
font.setupCharacterMap({32: 'space', 48: 'zero', 52: 'four'})
font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name: (400, 36 if name in patterns else 0) for name in glyphs})
font.setupHorizontalHeader(ascent=800, descent=-200)
font.setupNameTable({'familyName': '404 Display', 'styleName': 'Regular',
                    'uniqueFontIdentifier': '404Display-Regular-1.0',
                    'fullName': '404 Display Regular', 'psName': '404Display-Regular',
                    'version': 'Version 1.0'})
font.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
font.setupPost()
font.setupMaxp()
font.save(Path(__file__).resolve().parents[1] / 'assets/fonts/404-display.ttf')
