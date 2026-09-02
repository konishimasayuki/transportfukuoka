# 指定範囲(mm)のインクの塊を原本と実装で並べて出す。位置ずれの特定用。
import sys
import numpy as np
from PIL import Image
MM = 1654/210.0
REF = np.array(Image.open('/home/user/transportfukuoka/formcheck/out/reference-normalized.png').convert('L'))
CUR = np.array(Image.open('/home/user/transportfukuoka/formcheck/out/render-raw.png').convert('L').resize((1654,2339)))
def runs(im, x0, y0, x1, y1, thr=170, minpx=2, gap=0.55):
    a = im[int(y0*MM):int(y1*MM), int(x0*MM):int(x1*MM)]
    cols = (a < thr).sum(axis=0) >= minpx
    out, s = [], None
    for i, v in enumerate(list(cols)+[False]):
        if v and s is None: s = i
        elif not v and s is not None: out.append((x0+s/MM, x0+i/MM)); s = None
    mg = []
    for a_, b_ in out:
        if mg and a_-mg[-1][1] < gap: mg[-1] = (mg[-1][0], b_)
        else: mg.append((a_, b_))
    return [(round(a_,2), round(b_,2)) for a_, b_ in mg if b_-a_ > 0.35]
if __name__ == '__main__':
    x0,y0,x1,y1 = map(float, sys.argv[1:5])
    r, c = runs(REF,x0,y0,x1,y1), runs(CUR,x0,y0,x1,y1)
    print(f'{"原本":<22}{"実装":<22}{"ずれ"}')
    for i in range(max(len(r), len(c))):
        a = f'{r[i][0]:.2f}〜{r[i][1]:.2f}' if i < len(r) else '—'
        b = f'{c[i][0]:.2f}〜{c[i][1]:.2f}' if i < len(c) else '—'
        d = f'{c[i][0]-r[i][0]:+.2f}mm' if i < len(r) and i < len(c) else ''
        print(f'{a:<22}{b:<22}{d}')
