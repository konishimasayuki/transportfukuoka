# ブロック別の一致率レポート。全体1つの数字では原因が分からないので、
# 帳票の各ブロック（mm矩形）ごとに raw / gray / ssim / edge / geometry を出す。
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from compare import load, to_gray, line_positions, ssim, edge_score

D = os.path.join(os.path.dirname(__file__), 'out')
MM = 1654 / 210.0

# blocks.css の定義そのまま（left, top, width, height in mm）
BLOCKS = [
    ('受付(1)(2)',      107.8,  17.35,  96.1,   6.4),
    ('引越日ほか日程',      5.4,  24.7,   77.8,  15.45),
    ('スペース/作業量',     84.9,  24.7,   31.8,  15.45),
    ('引越階/ピアノ階',    118.1,  24.7,   27.4,  15.45),
    ('発送内容',          146.8,  24.7,   24.9,  15.45),
    ('見積日/受付日',      172.8,  24.7,   30.9,  15.45),
    ('フロント',         173.09,  39.9,  30.67,   7.84),
    ('お名前',            5.18,  40.7,  98.39,  11.3),
    ('現住所/転居先',       5.5,  52.0,  176.3,  22.2),
    ('確認日',           182.9,  52.0,   20.9,  22.2),
    ('作業内容の確認',      5.5,  85.3,   49.1,  15.95),
    ('ピアノU・G',        55.7,  85.3,   50.02, 15.95),
    ('エアコン移設',      106.8,  85.3,   97.1,  15.95),
    ('作業状況',           5.5, 104.1,  198.4,  11.4),
    ('家財表',            5.51, 116.33, 198.43, 64.10),
    ('請求先',             5.6, 181.0,  148.7,  18.2),
    ('お支払方法',        154.9, 180.2,   49.3,  18.67),
    ('その他の料金',      154.9, 199.59,  49.3,  74.31),
    ('お約束事項',         5.6, 199.6,  148.7,  31.27),
    ('料金A',              5.5, 231.64,  46.7,  42.68),
    ('料金B',             52.2, 231.64,  46.3,  42.68),
    ('料金C',             98.5, 231.64,  55.8,  42.68),
    ('媒体',               5.5, 275.4,   62.7,   4.05),
    ('ご紹介先',           5.5, 279.62,  62.7,  10.88),
    ('事業内容',        155.17, 275.4,  49.58,  15.59),
]

def crop(a, x, y, w, h, pad=1.5):
    x0, y0 = int(max(0, (x - pad) * MM)), int(max(0, (y - pad) * MM))
    x1, y1 = int(min(a.shape[1], (x + w + pad) * MM)), int(min(a.shape[0], (y + h + pad) * MM))
    return a[y0:y1, x0:x1]

def geo(gr, gc):
    (h1, v1), (h2, v2) = line_positions(gr), line_positions(gc)
    def m(a, b):
        if not a: return 1.0
        return float(np.mean([max(0.0, 1 - min(min((abs(p - q) for (q, _) in b), default=5.0), 5.0) / 5.0) for (p, _) in a]))
    return (m(h1, h2) + m(v1, v2)) / 2

def main():
    gr = to_gray(load(os.path.join(D, 'reference-normalized.png')))
    # compare.py を通さずに済むよう、生レンダを原本サイズへ正規化して使う
    raw = Image.open(os.path.join(D, 'render-raw.png')).convert('RGB').resize((1654, 2339), Image.LANCZOS)
    gc = to_gray(np.asarray(raw).astype(np.float64))
    rows = []
    for name, x, y, w, h in BLOCKS:
        a, b = crop(gr, x, y, w, h), crop(gc, x, y, w, h)
        n = min(a.shape[0], b.shape[0]); m_ = min(a.shape[1], b.shape[1])
        a, b = a[:n, :m_], b[:n, :m_]
        raw = 1 - np.abs(a.astype(float) - b.astype(float)).mean() / 255
        sm = float(ssim(a.astype(np.float64), b.astype(np.float64), data_range=255))
        ed = edge_score(a, b)[0]
        g = geo(a, b)
        total = 0.35 * g + 0.30 * ed + 0.20 * sm + 0.10 * raw + 0.05 * raw
        rows.append((total * 100, name, g * 100, ed * 100, sm * 100, raw * 100))
    rows.sort()
    print(f'{"ブロック":<18}{"総合":>7}{"geometry":>10}{"edge":>8}{"ssim":>8}{"raw":>8}')
    for t, name, g, e, s, r in rows:
        print(f'{name:<18}{t:7.2f}{g:10.2f}{e:8.2f}{s:8.2f}{r:8.2f}')

if __name__ == '__main__':
    main()
