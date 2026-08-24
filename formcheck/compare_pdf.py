#!/usr/bin/env python3
"""印刷PDF（render-print.pdf）を200dpi相当で画像化し、画面用と同じ5指標で実測する。
最終判定は画面よりこちらを重視する（仕様36）。"""
import numpy as np, json, os, sys
import pypdfium2 as pdfium
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import compare as C

D = os.path.join(os.path.dirname(__file__), 'out')
pdf = pdfium.PdfDocument(os.path.join(D, 'render-print.pdf'))
page = pdf[0]
bmp = page.render(scale=200/72)   # 200dpi
im = bmp.to_pil().convert('RGB').resize((C.W, C.H), Image.LANCZOS)
im.save(os.path.join(D, 'render-print.png'))

ref = C.load(os.path.join(D, 'reference-normalized.png'))
cur = np.asarray(im, np.float32)
gr, gc = C.to_gray(ref), C.to_gray(cur)
from skimage.metrics import structural_similarity as ssim
raw = float(1 - np.abs(ref - cur).mean() / 255)
gray = float(1 - np.abs(gr - gc).mean() / 255)
ss = float(ssim(gr.astype(np.float64), gc.astype(np.float64), data_range=255))
ed, _, _ = C.edge_score(gr, gc)
geo = C.geometry_score(gr, gc)
total = geo*.35 + ed*.30 + ss*.20 + gray*.10 + raw*.05
ov = (ref*0.5 + cur*0.5).astype(np.uint8)
Image.fromarray(ov).save(os.path.join(D, 'overlay-print.png'))
print(json.dumps(dict(kind='print-pdf', raw=round(raw*100,4), gray=round(gray*100,4),
      ssim=round(ss*100,4), edge=round(ed*100,4), geometry=round(geo*100,4),
      total=round(total*100,4)), ensure_ascii=False, indent=1))
