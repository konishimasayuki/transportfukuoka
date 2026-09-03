// ブラウザ印刷で「背景のグラフィック」がオフでも、矢印・斜線・黒帯が残るかを実測する。
//   page.pdf({ printBackground: false }) で PDF を作り、PyMuPDF で 200dpi に描画して
//   該当領域の黒画素を数える。
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await b.newPage({ viewport: { width: 1000, height: 1200 } })
page.on('pageerror', e => console.log('PAGEERROR:', String(e)))
await page.goto('http://localhost:5173/estimate-form/index.html?v=' + Date.now())
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(300)
await page.emulateMedia({ media: 'print' })
const pdf = path.join(OUT, 'print-nobg.pdf')
await page.pdf({ path: pdf, format: 'A4', printBackground: false, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
await b.close()

// 200dpi で描画して領域ごとの黒画素率を出す（mm 指定、A4 = 1654x2339px）
const py = `
import fitz, sys
doc = fitz.open(${JSON.stringify(pdf)})
pix = doc[0].get_pixmap(matrix=fitz.Matrix(200/72, 200/72), colorspace=fitz.csGRAY)
pix.save(${JSON.stringify(path.join(OUT, 'print-nobg.png'))})
import numpy as np
a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w)
MM = pix.w / 210.0
def dark(x0, y0, x1, y1):
    b = a[int(y0*MM):int(y1*MM), int(x0*MM):int(x1*MM)]
    return float((b < 128).mean())
checks = [
  ('ピアノ 階段行の矢印',       79.3, 93.0, 82.3, 96.3, 0.08),
  ('エアコン セパレート行の矢印', 130.1, 93.0, 133.2, 96.3, 0.08),
  ('梱包・開包の斜線',           104.5, 32.6, 109.2, 36.1, 0.02),
  ('お支払は…の黒帯',            98.5, 226.7, 153.5, 230.5, 0.45),
  ('洗濯機(付)の「付」',         160.8, 232.4, 163.3, 234.6, 0.02),
]
ng = 0
for name, x0, y0, x1, y1, th in checks:
    d = dark(x0, y0, x1, y1)
    ok = d >= th
    ng += (not ok)
    print(('OK ' if ok else 'NG ') + name + f'  黒画素率 {d:.3f}（しきい値 {th}）')
print('NG:', ng, '/', len(checks))
`
console.log(execFileSync('python3', ['-c', py]).toString())
