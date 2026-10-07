import json
import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).parent
app = FastAPI()


# 開發時不要讓瀏覽器快取 css/js/html，改了檔案重新整理就會生效
@app.middleware("http")
async def no_cache(request, call_next):
    resp = await call_next(request)
    if not request.url.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-cache, must-revalidate"
    return resp


# 0. API 路由要放在所有 mount 之前（"/" 的 mount 會吃掉其他沒匹配到的路徑）
@app.get("/api/courses")
def courses():
    # cs.py 產生的 cs_courses.json，放在專案根目錄（與 main.py 同層）
    with open(BASE / "cs_courses.json", encoding="utf-8") as f:
        return json.load(f)


def _short_domain(d: str) -> str:
    """'G 人文-文學與藝術(105始)' → '人文-文學與藝術'"""
    d = re.sub(r"^[A-Za-z]\s+", "", d)
    return re.sub(r"\s*[(（]?\d+始[)）]?\s*$", "", d).strip()


def _load_domain_index():
    """general_domains.json（general_domains.py 產生）→ {課號: [領域...]}、{課名: [領域...]}、{課號: 學分}"""
    path = BASE / "general_domains.json"
    by_id, by_name, credits = {}, {}, {}
    if not path.exists():
        return by_id, by_name, credits
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    for r in rows:
        dom = _short_domain(r["domain"])
        for table, key in ((by_id, r["course_id"].strip()), (by_name, r["course_name"].strip())):
            lst = table.setdefault(key, [])
            if dom not in lst:
                lst.append(dom)
        credits[r["course_id"].strip()] = r.get("credits", "")
    return by_id, by_name, credits


@app.get("/api/general-courses")
def general_courses():
    # 通識課資料：general_courses.json，放在專案根目錄（與 main.py 同層）
    path = BASE / "general_courses.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        courses = json.load(f)

    # 一個一個比對：先用課號，找不到再用課名
    by_id, by_name, credits = _load_domain_index()
    for c in courses:
        cid = str(c.get("course_id", "")).strip()
        name = str(c.get("course_name", "")).strip()
        doms = by_id.get(cid) or by_name.get(name) or []
        c["domain"] = "、".join(doms) if doms else "未分類"
        # 學分以官方對照表為準（去掉 2.00 → 2）
        cr = credits.get(cid)
        if cr and not c.get("credits"):
            try:
                c["credits"] = str(int(float(cr))) if float(cr).is_integer() else cr
            except ValueError:
                c["credits"] = cr
    return courses


# 1. 先掛載特定的靜態檔案目錄 (CSS, JS 等)
app.mount("/css", StaticFiles(directory="client/css"), name="css")
app.mount("/js", StaticFiles(directory="client/js"), name="js")

# 2. 最後才掛載 HTML 根目錄 (會涵蓋 client/html 下的所有 .html 檔案)
app.mount("/", StaticFiles(directory="client/html", html=True), name="html")