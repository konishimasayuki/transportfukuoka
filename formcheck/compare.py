#!/usr/bin/env python3
"""原本とHTMLレンダリングの実測比較。

寸法: 1654x2339（A4@200dpi）へ両者を正規化して比較する。条件は固定。
指標（重みも固定。途中変更禁止）:
  Geometry 35% / Edge 30% / SSIM 20% / Grayscale 10% / RawPixel 5%
出力: overlay-50.png, diff.png, diff-amplified.png, heatmap.png,
      history.jsonl 追記, best/ 更新（総合値がベストを上回った時のみ）
"""
import numpy as np, json, os, shutil, sys, datetime
from PIL import Image
from skimage.metrics import structural_similarity as ssim
from skimage.feature import canny
from scipy_free_dilate import binary_dilate  # 下で定義するローカルモジュール

D = os.path.join(os.path.dirname(__file__), 'out')
W, H = 1654, 2339

def load(p, size=(W, H)):
    im = Image.open(p).convert('RGB')
    if im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, np.float32)

def to_gray(a):
    return a @ np.array([0.299, 0.587, 0.114], np.float32)

def erode1d(a, L, axis):
    cs = np.cumsum(a, axis=axis)
    if axis == 1:
        cs = np.concatenate([np.zeros((a.shape[0], 1), np.int64), cs.astype(np.int64)], axis=1)
        win = cs[:, L:] - cs[:, :-L]
    else:
        cs = np.concatenate([np.zeros((1, a.shape[1]), np.int64), cs.astype(np.int64)], axis=0)
        win = cs[L:, :] - cs[:-L, :]
    hit = (win == L)
    res = np.zeros_like(a)
    for off in range(L):
        if axis == 1: res[:, off:off + hit.shape[1]] |= hit.astype(np.uint8)
        else: res[off:off + hit.shape[0], :] |= hit.astype(np.uint8)
    return res

def line_positions(g, axis_len=40):
    """長い罫線の中心位置リスト（横線のy／縦線のx）を返す"""
    b = (g < 150).astype(np.uint8)
    hm = erode1d(b, 40, 1); vm = erode1d(b, 24, 0)
    def centers(mask, ax):
        prof = mask.sum(axis=1 - ax) if ax == 0 else mask.sum(axis=0)
        prof = mask.sum(axis=1) if ax == 0 else mask.sum(axis=0)
        idx = np.where(prof > (60 if ax == 0 else 40))[0]
        groups = []
        for i in idx:
            if groups and i - groups[-1][-1] <= 2: groups[-1].append(i)
            else: groups.append([i])
        out = []
        for gr in groups:
            wsum = sum(prof[i] * i for i in gr); tot = sum(prof[i] for i in gr)
            out.append((wsum / tot, tot))
        return out
    return centers(hm, 0), centers(vm, 1)

def geometry_score(gr, gc):
    (h1, v1), (h2, v2) = line_positions(gr), line_positions(gc)
    def match(a, b):
        if not a: return 1.0, []
        errs = []
        for (p, w) in a:
            if not b: errs.append(5.0); continue
            d = min(abs(p - q) for (q, _) in b)
            errs.append(min(d, 5.0))
        score = float(np.mean([max(0.0, 1 - e / 5.0) for e in errs]))
        return score, errs
    sh, _ = match(h1, h2); sv, _ = match(v1, v2)
    return (sh + sv) / 2

def edge_score(gr, gc):
    e1 = canny(gr / 255.0, sigma=1.2); e2 = canny(gc / 255.0, sigma=1.2)
    d1 = binary_dilate(e1, 2); d2 = binary_dilate(e2, 2)
    p = (e2 & d1).sum() / max(e2.sum(), 1)   # precision: レンダの縁が原本近傍にあるか
    r = (e1 & d2).sum() / max(e1.sum(), 1)   # recall: 原本の縁が再現されているか
    return 2 * p * r / max(p + r, 1e-9), e1, e2

def main(label):
    ref = load(os.path.join(D, 'reference-normalized.png'))
    cur = load(os.path.join(D, 'render-raw.png'))
    Image.fromarray(cur.astype(np.uint8)).save(os.path.join(D, 'render-current.png'))
    gr, gc = to_gray(ref), to_gray(cur)

    raw = float(1 - np.abs(ref - cur).mean() / 255)
    gray = float(1 - np.abs(gr - gc).mean() / 255)
    ss = float(ssim(gr.astype(np.float64), gc.astype(np.float64), data_range=255))
    ed, e1, e2 = edge_score(gr, gc)
    geo = geometry_score(gr, gc)
    total = geo * .35 + ed * .30 + ss * .20 + gray * .10 + raw * .05

    # 生成物
    ov = (ref * 0.5 + cur * 0.5).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(D, 'overlay-50.png'))
    diff = np.abs(gr - gc)
    Image.fromarray((255 - diff).astype(np.uint8)).save(os.path.join(D, 'diff.png'))
    Image.fromarray((255 - np.clip(diff * 4, 0, 255)).astype(np.uint8)).save(os.path.join(D, 'diff-amplified.png'))
    # ヒートマップ（16x16ブロック平均の差）
    bh, bw = (H // 7) * 7, (W // 7) * 7
    hb = diff[:bh, :bw].reshape(H // 7, 7, W // 7, 7).mean(axis=(1, 3))
    hm = np.clip(hb * 3, 0, 255).astype(np.uint8)
    heat = np.zeros((*hb.shape, 3), np.uint8); heat[..., 0] = hm; heat[..., 2] = 255 - hm
    Image.fromarray(heat).resize((W, H), Image.NEAREST).save(os.path.join(D, 'heatmap.png'))

    rec = dict(t=datetime.datetime.now().isoformat(timespec='seconds'), label=label,
               raw=round(raw*100,4), gray=round(gray*100,4), ssim=round(ss*100,4),
               edge=round(ed*100,4), geometry=round(geo*100,4), total=round(total*100,4))
    with open(os.path.join(D, 'history.jsonl'), 'a') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')

    best_file = os.path.join(D, 'best', 'record.json')
    prev = json.load(open(best_file))['total'] if os.path.exists(best_file) else -1
    if total * 100 > prev:
        os.makedirs(os.path.join(D, 'best'), exist_ok=True)
        for fn in ['render-current.png', 'overlay-50.png', 'diff.png']:
            shutil.copy(os.path.join(D, fn), os.path.join(D, 'best', fn))
        json.dump(rec, open(best_file, 'w'), ensure_ascii=False)
        rec['best'] = True
    print(json.dumps(rec, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'iter')
