import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).parent
app = FastAPI()


# 0. API 路由要放在所有 mount 之前（"/" 的 mount 會吃掉其他沒匹配到的路徑）
@app.get("/api/courses")
def courses():
    # cs.py 產生的 cs_courses.json，放在專案根目錄（與 main.py 同層）
    with open(BASE / "cs_courses.json", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/general-courses")
def general_courses():
    # 通識課資料：general_courses.json，放在專案根目錄（與 main.py 同層）
    path = BASE / "general_courses.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# 1. 先掛載特定的靜態檔案目錄 (CSS, JS 等)
app.mount("/css", StaticFiles(directory="client/css"), name="css")
app.mount("/js", StaticFiles(directory="client/js"), name="js")

# 2. 最後才掛載 HTML 根目錄 (會涵蓋 client/html 下的所有 .html 檔案)
app.mount("/", StaticFiles(directory="client/html", html=True), name="html")