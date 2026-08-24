#!/usr/bin/env python3
"""参照とレンダの罫線マッチング誤差レポート（悪い順）"""
import numpy as np, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from compare import load, to_gray, line_positions, erode1d
import numpy as _np

D = os.path.join(os.path.dirname(__file__), 'out')
gr = to_gray(load(os.path.join(D, 'reference-normalized.png')))
gc = to_gray(load(os.path.join(D, 'render-current.png')))
(h1, v1), (h2, v2) = line_positions(gr), line_positions(gc)
MM = 210/1654
def rep(a, b, name, mm):
    rows = []
    for (p, w) in a:
        d, q = min(((abs(p-qq), qq) for (qq,_) in b), key=lambda t:t[0]) if b else (99, -1)
        rows.append((d, p, q, w))
    rows.sort(reverse=True)
    print(f"--- {name}: 悪い順 (ref位置px/mm, 最寄りrender位置, 誤差px) ---")
    for d,p,q,w in rows[:14]:
        print(f"ref {p:7.1f}px ({p*mm:6.2f}mm) -> render {q:7.1f}  err {d:5.1f}px  strength {w}")
    errs=[min(min(abs(p-qq) for (qq,_) in b),5) for (p,_) in a]
    print(f"score={np.mean([max(0,1-e/5) for e in errs])*100:.1f}%  lines={len(a)}")
rep(h1, h2, 'H(y)', MM)
rep(v1, v2, 'V(x)', MM)
