import sys

# 优先用 pypdf，它是 PyPDF2 的继任者，接口一致但维护更活跃；
# 老环境里可能只装了 PyPDF2，所以退而求其次导入它并统一别名，
# 后面代码只认 pypdf 这个名字，不用到处判断。
try:
    import pypdf
except ImportError:
    try:
        import PyPDF2 as pypdf
    except ImportError:
        print("没有装 PDF 库，先执行: pip install pypdf")
        sys.exit(1)

# 路径不写死在代码里：优先用命令行参数，没给才用默认值。
# 这样换台机器、换个文件都不用改源码。
if len(sys.argv) > 1:
    path = sys.argv[1]
else:
    path = r"F:\elysia\学习\材料\1.1 映射与函数.pdf"

try:
    reader = pypdf.PdfReader(path)
except FileNotFoundError:
    print("找不到文件:", path)
    sys.exit(1)

print("页数:", len(reader.pages))

# 只预览前 3 页，避免整本课件一次性刷屏；
# 页数不足 3 页时切片会自动截断，不用额外判断。
for i, page in enumerate(reader.pages[:3]):
    print("---第", i + 1, "页---")
    # 有些 PDF 是扫描件，没有文字层，extract_text 会返回空串，
    # 这里显式提示一下，免得用户以为程序坏了。
    text = page.extract_text()
    if text:
        print(text)
    else:
        print("(这一页没有可提取的文字，可能是扫描图片)")
