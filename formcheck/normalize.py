#!/usr/bin/env python3
"""原本スキャン（public/IMG_9280.jpeg）をA4座標へ正規化する。

- 傾き補正：全幅の横罫線を回帰して得た -0.065° を打ち消す
- 200dpi相当の A4（1654×2339px）へリサイズ
- 出力: formcheck/out/reference-normalized.png

以後の比較はすべてこの画像・この寸法を基準にする（途中変更禁止）。
"""
import numpy as np
from PIL import Image
import os

W, H = 1654, 2339           # A4 @200dpi（この寸法は固定。変更しないこと）
SKEW_DEG = -0.0647          # normalize.py 実測（横罫線の回帰）

def main():
    src = Image.open(os.path.join(os.path.dirname(__file__), '..', 'public', 'IMG_9280.jpeg'))
    img = src.convert('RGB').rotate(SKEW_DEG, resample=Image.BICUBIC, fillcolor=(255, 255, 255))
    img = img.resize((W, H), Image.LANCZOS)
    out = os.path.join(os.path.dirname(__file__), 'out')
    os.makedirs(out, exist_ok=True)
    img.save(os.path.join(out, 'reference-normalized.png'))
    print('saved', img.size)

if __name__ == '__main__':
    main()
