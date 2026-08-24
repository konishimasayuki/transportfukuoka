"""scipy無しの2値膨張（チェビシェフ距離r）"""
import numpy as np
def binary_dilate(a, r):
    out = a.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy == 0 and dx == 0: continue
            s = np.zeros_like(a)
            ys = slice(max(0, dy), a.shape[0] + min(0, dy))
            yd = slice(max(0, -dy), a.shape[0] + min(0, -dy))
            xs = slice(max(0, dx), a.shape[1] + min(0, dx))
            xd = slice(max(0, -dx), a.shape[1] + min(0, -dx))
            s[yd, xd] = a[ys, xs]
            out |= s
    return out
