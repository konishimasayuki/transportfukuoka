#!/usr/bin/env python3
"""正規化済み原本から罫線の座標を抽出して JSON に落とす。

長さLの直線カーネルで erosion（=そこにL連続の黒がある画素だけ残す）してから
線分をグループ化する。文字は消え、罫線だけが残る。
"""
import numpy as np, json, os
from PIL import Image

D = os.path.join(os.path.dirname(__file__), 'out')
im = np.asarray(Image.open(os.path.join(D, 'reference-normalized.png')).convert('L'), np.float32)
b = (im < 150).astype(np.uint8)
H, W = b.shape
PX2MM = 210.0 / W

def erode1d(a, L, axis):
    """axis 方向に長さ L の全黒だけ残す"""
    out = a.copy()
    # 累積和で高速化
    cs = np.cumsum(a, axis=axis)
    if axis == 1:
        pad = np.zeros((a.shape[0], 1), a.dtype if a.dtype != np.uint8 else np.int64)
        cs = np.concatenate([np.zeros((a.shape[0],1), np.int64), cs.astype(np.int64)], axis=1)
        win = cs[:, L:] - cs[:, :-L]           # 各開始位置の合計
        hit = (win == L)
        res = np.zeros_like(a)
        for off in range(L):
            res[:, off:off+hit.shape[1]] |= hit.astype(np.uint8)
        return res
    else:
        cs = np.concatenate([np.zeros((1,a.shape[1]), np.int64), cs.astype(np.int64)], axis=0)
        win = cs[L:, :] - cs[:-L, :]
        hit = (win == L)
        res = np.zeros_like(a)
        for off in range(L):
            res[off:off+hit.shape[0], :] |= hit.astype(np.uint8)
        return res

hmask = erode1d(b, 40, axis=1)   # 横に40px(≈5mm)連続 → 横罫線
vmask = erode1d(b, 24, axis=0)   # 縦に24px(≈3mm)連続 → 縦罫線

def segments(mask, axis):
    """罫線マスクを線分リストへ。axis=0:横線(行方向グループ)、axis=1:縦線"""
    out = []
    if axis == 0:
        prof = mask.sum(axis=1)
        ys = np.where(prof > 0)[0]
        groups = []
        for y in ys:
            if groups and y - groups[-1][-1] <= 2: groups[-1].append(y)
            else: groups.append([y])
        for g in groups:
            band = mask[g[0]:g[-1]+1].max(axis=0)
            xs = np.where(band)[0]
            # 線分に分割
            s = xs[0]; prev = xs[0]
            wsum = (mask[g[0]:g[-1]+1] * np.arange(g[0], g[-1]+1)[:,None]).sum()
            yc = wsum / mask[g[0]:g[-1]+1].sum()
            for x in xs[1:]:
                if x - prev > 8:
                    out.append(dict(y=round(float(yc),1), y_mm=round(float(yc)*PX2MM,2), x0=int(s), x1=int(prev)+1, w=int(prev)-int(s)+1))
                    s = x
                prev = x
            out.append(dict(y=round(float(yc),1), y_mm=round(float(yc)*PX2MM,2), x0=int(s), x1=int(prev)+1, w=int(prev)-int(s)+1))
    else:
        prof = mask.sum(axis=0)
        xs = np.where(prof > 0)[0]
        groups = []
        for x in xs:
            if groups and x - groups[-1][-1] <= 2: groups[-1].append(x)
            else: groups.append([x])
        for g in groups:
            band = mask[:, g[0]:g[-1]+1].max(axis=1)
            ys = np.where(band)[0]
            wsum = (mask[:, g[0]:g[-1]+1] * np.arange(g[0], g[-1]+1)[None,:]).sum()
            xc = wsum / mask[:, g[0]:g[-1]+1].sum()
            s = ys[0]; prev = ys[0]
            for y in ys[1:]:
                if y - prev > 8:
                    out.append(dict(x=round(float(xc),1), x_mm=round(float(xc)*PX2MM,2), y0=int(s), y1=int(prev)+1, h=int(prev)-int(s)+1))
                    s = y
                prev = y
            out.append(dict(x=round(float(xc),1), x_mm=round(float(xc)*PX2MM,2), y0=int(s), y1=int(prev)+1, h=int(prev)-int(s)+1))
    return [o for o in out if (o.get('w',0) >= 40 or o.get('h',0) >= 24)]

data = dict(size=[W,H], px2mm=PX2MM, hlines=segments(hmask,0), vlines=segments(vmask,1))
with open(os.path.join(D,'lines.json'),'w') as f: json.dump(data,f,ensure_ascii=False)
print('h segments:', len(data['hlines']), ' v segments:', len(data['vlines']))
print('long hlines y(px):', sorted({l['y'] for l in data['hlines'] if l['w']>W*0.55}))
