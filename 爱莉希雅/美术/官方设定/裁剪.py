from PIL import Image
import numpy as np, os
src = r"F:\elysia\爱莉希雅\美术\官方设定\正面设定.jpg"
out = r"F:\elysia\爱莉希雅\美术\官方设定"
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(int)
bg = a[5, 5]
diff = np.abs(a - bg).sum(axis=2)
mask = diff > 45
# 只取中间区域，避开左上角UI和右上logo
mask[:60, :] = False
mask[:, :300] = False
mask[:, -420:] = False
mask[-120:, :] = False
ys, xs = np.where(mask)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print("人物框", x0, y0, x1, y1, "尺寸", x1-x0, y1-y0)
pad = 12
crop = im.crop((max(0,x0-pad), max(0,y0-pad), min(im.width,x1+pad), min(im.height,y1+pad)))
crop.save(os.path.join(out, "正面-裁剪.png"))
up = crop.resize((crop.width*3, crop.height*3), Image.LANCZOS)
up.save(os.path.join(out, "正面-裁剪x3.png"))
print("裁剪", crop.size, "→ 3倍", up.size)