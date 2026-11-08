import io
import json
import re
import time
from urllib.request import Request, urlopen
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles


app = FastAPI()
CLIENT = Path(__file__).resolve().parent / "client"
DATA = CLIENT / "data"
COURSE_CSV_URL = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php?export=csv"
COURSE_CACHE_SECONDS = 900
_course_cache = None
_course_cache_expires_at = 0.0
_CS_ELECTIVE_CODES = frozenset(
    """
    210150 210012 210015 210021 210023 210123 210124 210125
    210126 210130 210131 210132 210133 210134 210135 210136
    210140 210141 210142 210143 210146 210147 210148 210149
    210009 210086 210115 210145 210029 210153 210154 210156
    210157 210158 210159 210161 210163 210164 210165 210166
    210167 210168 210169 210170 210171 210172 210173 210174
    """.split()
)
_GENERAL_DOMAIN_AREAS = {
    "G": "人文",
    "H": "人文",
    "I": "社會",
    "J": "社會",
    "K": "自然",
    "L": "自然",
    "M": "特色",
    "N": "特色",
    "O": "特色",
}
_COURSE_COLUMNS = {
    "學期",
    "課號",
    "班別",
    "中文課名",
    "開課系所",
    "系統可選年級",
    "開課教師",
    "地點",
    "時間",
    "學分數",
}


def _read_course_json(filename):
    path = DATA / filename
    try:
        records = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"無法讀取課程分類資料 {filename}：{error}") from error
    if not isinstance(records, list) or not all(isinstance(record, dict) for record in records):
        raise HTTPException(status_code=500, detail=f"課程分類資料 {filename} 格式錯誤")
    return records


def _course_sources(semester):
    common = _read_course_json("common.json")
    cs_courses = _read_course_json("cs_courses.json")
    general_courses = _read_course_json("general_courses.json")
    general_domains = _read_course_json("general_domains.json")
    physical = _read_course_json("physical.json")

    general_year = semester[:3]
    domains_by_code = {
        record["course_id"]: record["domain"]
        for record in general_domains
        if record.get("year") == general_year and record.get("course_id") and record.get("domain")
    }

    return {
        "common": {record["課號"] for record in common if record.get("課號")},
        "cs": {record["course_id"] for record in cs_courses if record.get("course_id")},
        "general": {record["course_id"] for record in general_courses if record.get("course_id")},
        "physical": {record["課號"] for record in physical if record.get("課號")},
        "domains": domains_by_code,
    }


def _load_courses():
    global _course_cache, _course_cache_expires_at
    if _course_cache is not None and time.monotonic() < _course_cache_expires_at:
        return _course_cache

    request = Request(COURSE_CSV_URL, headers={"User-Agent": "NCNU-course-dashboard/1.0"})
    try:
        with urlopen(request, timeout=30) as response:
            csv_data = response.read()
        frame = pd.read_csv(io.BytesIO(csv_data), dtype=str, encoding="utf-8-sig", keep_default_na=False)
    except (OSError, UnicodeDecodeError, pd.errors.ParserError) as error:
        raise HTTPException(status_code=502, detail=f"無法取得或解析學校課程 CSV：{error}") from error

    missing_columns = _COURSE_COLUMNS.difference(frame.columns)
    if missing_columns:
        missing = "、".join(sorted(missing_columns))
        raise HTTPException(status_code=502, detail=f"課程 CSV 缺少必要欄位：{missing}")

    if frame.empty:
        raise HTTPException(status_code=502, detail="課程 CSV 沒有可用的課程資料")
    semester = frame.iloc[0]["學期"].strip()
    sources = _course_sources(semester)
    source_codes = sources["common"] | sources["cs"] | sources["general"] | sources["physical"]
    courses = []
    for row in frame.to_dict(orient="records"):
        course_code = row["課號"].strip()
        if course_code not in source_codes:
            continue
        class_code = row["班別"].strip()
        name = row["中文課名"].strip()
        if not course_code or not name:
            raise HTTPException(status_code=502, detail="課程 CSV 包含缺少課號或課名的資料列")

        credits_value = pd.to_numeric(row["學分數"], errors="coerce")
        if pd.isna(credits_value):
            raise HTTPException(status_code=502, detail=f"課程「{name}」的學分數格式無效")
        credits_number = float(credits_value)
        credits = int(credits_number) if credits_number.is_integer() else credits_number
        grade_eligibility = row["系統可選年級"].strip()
        grade_match = re.search(r"\d+", grade_eligibility)
        domain = None
        is_cs_required = "資工" in name
        if course_code in sources["cs"]:
            category = "專業選修" if course_code in _CS_ELECTIVE_CODES and not is_cs_required else "專業必修"
            group = "資工系必選修"
        elif course_code in sources["common"]:
            category = "專業必修" if is_cs_required else "校共同必修"
            group = "校共同必修"
        elif course_code in sources["physical"]:
            if is_cs_required:
                category = "專業必修"
            else:
                category = "特色運動" if name.startswith("體育:") else "體育"
            group = "體育"
        else:
            category = "專業必修" if is_cs_required else "通識"
            group = "通識"
            domain_name = sources["domains"].get(course_code, "")
            domain = _GENERAL_DOMAIN_AREAS.get(domain_name[:1])
        courses.append(
            {
                "id": f"{course_code}-{class_code}",
                "courseCode": course_code,
                "name": name,
                "category": category,
                "group": group,
                "domain": domain,
                "credits": credits,
                "time": row["時間"].strip(),
                "teacher": row["開課教師"].strip(),
                "location": row["地點"].strip(),
                "grade": int(grade_match.group()) if grade_match else 0,
                "gradeEligibility": grade_eligibility,
            }
        )

    if not courses:
        raise HTTPException(status_code=502, detail="學校 CSV 中找不到分類資料所列的開課課程")

    _course_cache = {"semester": semester, "courses": courses}
    _course_cache_expires_at = time.monotonic() + COURSE_CACHE_SECONDS
    return _course_cache


@app.get("/api/courses")
def get_courses():
    return _load_courses()


app.mount("/css", StaticFiles(directory=CLIENT / "css"), name="css")
app.mount("/js", StaticFiles(directory=CLIENT / "js"), name="js")
app.mount("/data", StaticFiles(directory=CLIENT / "data"), name="data")

app.mount("/", StaticFiles(directory=CLIENT / "html", html=True), name="html")