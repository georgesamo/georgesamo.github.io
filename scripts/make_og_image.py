"""Regenerate assets/og-image.png (1200x630 link-preview card).
Usage: python scripts/make_og_image.py   (needs: pip install pymupdf)
"""
import math, pathlib, pymupdf

W, H = 1200, 630
out = pathlib.Path(__file__).resolve().parent.parent / "assets" / "og-image.png"
hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
BG, RUBY, TEXT, MUTED, GREEN, DOT = map(hexc, ["#07110c", "#3ad08f", "#e4efe8", "#6c857a", "#e3bf62", "#123524"])

doc = pymupdf.open()
page = doc.new_page(width=W, height=H)
page.draw_rect(page.rect, color=None, fill=BG)
for x in range(0, W, 24):
    for y in range(0, H, 24):
        page.draw_circle((x + 12, y + 12), 1.1, color=None, fill=DOT)

# wireframe gem
cx, cy, R = 930, 300, 190
def pt(r, a, y): return (cx + r * math.cos(a), cy + y)
n = 8
table = [pt(R * 0.5, i / n * 2 * math.pi, -R * 0.42) for i in range(n)]
gird = [pt(R, (i + 0.5) / n * 2 * math.pi, -R * 0.08) for i in range(n)]
culet = (cx, cy + R * 0.95)
# flatten to a side view: squash depth
def side(p): return (cx + (p[0] - cx), cy + (p[1] - cy))
sh = page.new_shape()
for i in range(n):
    a, b = table[i], table[(i + 1) % n]
    g0, g1 = gird[i], gird[(i + 1) % n]
    for s, e in [(a, b), (a, g0), (b, g0), (g0, g1), (g0, culet)]:
        sh.draw_line(side(s), side(e))
sh.finish(color=RUBY, width=2.2, stroke_opacity=0.85)
sh.commit()

page.insert_text((80, 150), "# hello, I'm", fontname="cour", fontsize=26, color=MUTED)
page.insert_text((74, 290), "Samuka", fontname="hebo", fontsize=150, color=TEXT)
page.draw_rect(pymupdf.Rect(664, 182, 678, 290), color=None, fill=RUBY)
page.insert_text((80, 360), "Senior Ruby on Rails Engineer", fontname="hebo", fontsize=36, color=TEXT)
page.insert_text((80, 408), "Giorgi Samukashvili  /  Tbilisi, Georgia", fontname="helv", fontsize=26, color=MUTED)
page.insert_text((80, 520), "$ git log --graph   # 8 years of healthcare backends", fontname="cour", fontsize=22, color=GREEN)
page.insert_text((80, 566), "georgesamo.github.io", fontname="cobo", fontsize=24, color=RUBY)

page.get_pixmap(dpi=72).save(out)
print("wrote", out)
