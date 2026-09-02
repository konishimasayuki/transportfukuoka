# 指定ブロック(mm)の罫線を原本と実装で突き合わせる。位置ずれの数値を出す。
# 使い方: python3 rules.py <x0> <y0> <x1> <y1>
import sys
import numpy as np
from PIL import Image
MM = 1654/210.0
REF = np.array(Image.open('/home/user/transportfukuoka/formcheck/out/reference-normalized.png').convert('L'))
CUR = np.array(Image.open('/home/user/transportfukuoka/formcheck/out/render-raw.png').convert('L').resize((1654,2339)))

def lines(im, x0, y0, x1, y1, axis, cov=0.55, thr=175):
    b = im[int(y0*MM):int(y1*MM), int(x0*MM):int(x1*MM)]
    d = (b < thr).sum(axis=axis)
    th = (b.shape[1] if axis == 1 else b.shape[0]) * cov
    base = y0 if axis == 1 else x0
    hits = [base + i/MM for i, v in enumerate(d) if v > th]
    out = []
    for p in hits:
        if out and p - out[-1][-1] < 0.5: out[-1].append(p)
        else: out.append([p])
    return [round(sum(o)/len(o), 2) for o in out]

def pair(a, b, name):
    # geometry と同じ「原本の各線に対する最近傍」で見る（1対1に割り当てない）
    print(f'--- {name} ---')
    bad = 0
    for p in a:
        if not b: print(f'  原本 {p:7.2f}  →  （実装に線なし）'); bad += 1; continue
        d, q = min((abs(p-q), q) for q in b)
        flag = '  ← ずれ' if d > 0.25 else ''
        if d > 0.25: bad += 1
        print(f'  原本 {p:7.2f}   実装 {q:7.2f}   {q-p:+6.2f}mm{flag}')
    extra = [q for q in b if not a or min(abs(p-q) for p in a) > 0.25]
    for q in extra: print(f'  （原本に無い線）    実装 {q:7.2f}')
    print(f'  → ずれ {bad}/{len(a)} 本、余分 {len(extra)} 本')

if __name__ == '__main__':
    x0, y0, x1, y1 = map(float, sys.argv[1:5])
    pair(lines(REF, x0, y0, x1, y1, 1), lines(CUR, x0, y0, x1, y1, 1), '横罫線 y(mm)')
    pair(lines(REF, x0, y0, x1, y1, 0), lines(CUR, x0, y0, x1, y1, 0), '縦罫線 x(mm)')
