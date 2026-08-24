#!/usr/bin/env python3
"""ゾーンごとに ref と render のインク相互相関から最適シフト(dx,dy)を実測する"""
import numpy as np, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from compare import load, to_gray
MM = 210/1654
ref = (to_gray(load('formcheck/out/reference-normalized.png')) < 150).astype(np.float32)
cur = (to_gray(load('formcheck/out/render-current.png')) < 150).astype(np.float32)
def best_shift(x0,x1,y0,y1,r=24):
    X0,X1,Y0,Y1 = [int(v/MM) for v in (x0,x1,y0,y1)]
    a = ref[Y0:Y1, X0:X1]
    best=(0,0,-1)
    for dy in range(-r,r+1,2):
        for dx in range(-r,r+1,2):
            b = cur[Y0+dy:Y1+dy, X0+dx:X1+dx]
            if b.shape!=a.shape: continue
            s = (a*b).sum()
            if s>best[2]: best=(dx,dy,s)
    # 細かく
    bx,by,_ = best
    for dy in range(by-2,by+3):
        for dx in range(bx-2,bx+3):
            b = cur[Y0+dy:Y1+dy, X0+dx:X1+dx]
            if b.shape!=a.shape: continue
            s=(a*b).sum()
            if s>best[2]: best=(dx,dy,s)
    ov = best[2]/max(a.sum(),1)
    return best[0]*MM, best[1]*MM, ov
zones = [
 ('タイトル',            27,62,13,23),
 ('お名前ラベル',         5.5,23,43,52),
 ('注記(裏面)',           104,173,40,52),
 ('日付1(引越日値)',      14.5,44,25,32),
 ('スペース欄ラベル',     85,98.5,25,40),
 ('発送内容',            147,172,25,40),
 ('見積日欄',            173,204,25,40),
 ('作業内容確認',         5.5,55,85,101),
 ('ピアノ欄',            56,106,85,101),
 ('エアコン欄',          107,157,85,101),
 ('作業状況C行',          9.5,204,106,111),
 ('家財col1名',          5.5,25,117,176),
 ('家財col2名',          36,56,117,176),
 ('家財col3名',          67,86,117,176),
 ('家財col4名',          99,117,117,176),
 ('家財col5名',          128,148,117,176),
 ('荷造資材',            159,204,117,155),
 ('請求先3行',           5.6,154,181,199),
 ('お支払方法',          155,204,180,200),
 ('その他料金ラベル',     155,180,203,245),
 ('注)4行',              11,100,214,231),
 ('基本料金表',           5.5,52,232,274),
 ('附帯料金表',           52,98,232,274),
 ('資材料金表',           98.5,154,232,274),
 ('合計〜再計',          155,204,244,274),
 ('媒体行',              5.5,68,275,279.6),
 ('会社名',              85,155,274,281),
 ('電話番号',            85,155,281,287),
 ('引越片付けリユース',   154,204,275,284),
]
print(f"{'zone':<14} dx(mm)  dy(mm)  overlap")
for (n,x0,x1,y0,y1) in zones:
    dx,dy,ov = best_shift(x0,x1,y0,y1)
    flag = ' <<<' if (abs(dx)>0.3 or abs(dy)>0.3) else ''
    print(f"{n:<14} {dx:+6.2f}  {dy:+6.2f}   {ov:.2f}{flag}")
