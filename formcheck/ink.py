# 原本の指定範囲（mm）で、どの列にインクがあるかを出す。空欄＝入力欄を置ける場所を探すのに使う。
import sys
from PIL import Image
import numpy as np
W, H = 1654, 2339          # A4 200dpi 正規化済み
MM = 1654 / 210.0          # px per mm
im = np.array(Image.open('/home/user/transportfukuoka/formcheck/out/reference-normalized.png').convert('L'))

def scan(x0, y0, x1, y1, thr=150):
    a = im[int(y0*MM):int(y1*MM), int(x0*MM):int(x1*MM)]
    dark = (a < thr).sum(axis=0)
    cols = dark > max(1, a.shape[0] * 0.12)      # 縦の12%以上が黒 = 文字/罫線
    runs, s = [], None
    for i, v in enumerate(list(cols) + [False]):
        if v and s is None: s = i
        elif not v and s is not None:
            runs.append((round(x0 + s/MM, 2), round(x0 + i/MM, 2))); s = None
    return runs

if __name__ == '__main__':
    x0, y0, x1, y1 = map(float, sys.argv[1:5])
    print(f'範囲 x={x0}〜{x1}mm y={y0}〜{y1}mm')
    for a, b in scan(x0, y0, x1, y1):
        print(f'  インク {a} 〜 {b} mm  （幅 {round(b-a,2)}）')
