from PIL import Image, ImageDraw
import glob, os

frames = sorted(glob.glob("design/gif-frames/*.png"), key=lambda p: int(os.path.basename(p).split(".")[0]))
target_w = 880
images = []
for path in frames:
    img = Image.open(path).convert("RGB")
    ratio = target_w / img.width
    img = img.resize((target_w, int(img.height * ratio)), Image.LANCZOS)
    images.append(img)

# keep a stable canvas so the gif does not jitter
w = images[0].width
h = max(i.height for i in images)
canvas = []
for img in images:
    layer = Image.new("RGB", (w, h), (8, 12, 20))
    layer.paste(img, (0, 0))
    canvas.append(layer)

# short caption on the first frame
draw = ImageDraw.Draw(canvas[0])
draw.rectangle([0, h - 34, w, h], fill=(9, 13, 22))
draw.text((16, h - 24), "Multi-Agent Code Studio — v1.6.0", fill=(200, 210, 225))

out = "design/demo.gif"
canvas[0].save(out, save_all=True, append_images=canvas[1:], duration=[1400, 1600, 1600, 1600, 1600, 2200], loop=0, optimize=True)
print("saved", out, os.path.getsize(out) // 1024, "KB", canvas[0].size)
