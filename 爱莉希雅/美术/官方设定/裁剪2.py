from PIL import Image
import os
src = r"F:\elysia\爱莉希雅\美术\官方设定\正面设定.jpg"
out = r"F:\elysia\爱莉希雅\美术\官方设定"
im = Image.open(src).convert("RGB")
w, h = im.size
px = im.load()
bg = px[5, 5]
x0, y0, x1, y1 = w, h, 0, 0
for y in range(60, h - 120, 2):
    for x in range(300, w - 420, 2):
        r, g, b = px[x, y]
        if abs(r-bg[0]) + abs(g-bg[1]) + abs(b-bg[2]) > 45:
            if x < x0: x0 = x
            if x > x1: x1 = x
            if y < y0: y0 = y
            if y > y1: y1 = y
print("人物框", x0, y0, x1, y1, "尺寸", x1-x0, y1-y0)
pad = 12
crop = im.crop((max(0,x0-pad), max(0,y0-pad), min(w,x1+pad), min(h,y1+pad)))
crop.save(os.path.join(out, "正面-裁剪.png"))
up = crop.resize((crop.width*3, crop.height*3), Image.LANCZOS)
up.save(os.path.join(out, "正面-裁剪x3.png"))
print("裁剪", crop.size, "-> 3x", up.size)