import hashlib
import json
import os
import re
import secrets
import sqlite3
import tempfile
import time
from contextlib import closing
from threading import Lock
from typing import List, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request as FastAPIRequest, Response
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from fastapi.staticfiles import StaticFiles


app = FastAPI()

CLIENT = Path(__file__).resolve().parent / "client"            # 前端資源根目錄
DATA = CLIENT / "data"                                         # 課程資料夾
USER_DATA_DIR = Path(__file__).resolve().parent / "user_data"  # 每位使用者的資料
USER_DATA_DB = Path(__file__).resolve().parent / "user_data.sqlite3"  

GOOGLE_CLIENT_ID = "609296002726-6qpc89smhfisnc7i2r81lr9r4jtc80fp.apps.googleusercontent.com"
AUTH_SESSION_COOKIE = "webui_lab_session"   # 存放 session token 的 cookie
AUTH_SESSION_SECONDS = 12 * 60 * 60         # session 有效時間
_auth_sessions = {}

COURSE_CACHE_SECONDS = 900          # 快取 15 分鐘
_course_cache = None                # 快取內容
_course_cache_expires_at = 0.0      # 快取到期時間
_course_cache_lock = Lock()         # 重新載入時的鎖，避免多執行緒重複載入

# 資工系「專業選修」的課號清單；不在此清單內的資工系課程視為「專業必修」
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

# 通識領域代碼（首字母）→ 四大領域對照
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

class GoogleCredential(BaseModel):
    """前端 Google 登入後取得的 ID token。"""
    credential: str = Field(min_length=1, max_length=10000)


class SelectedCourse(BaseModel):
    """使用者已選的單一課程；各欄位都有長度/範圍限制，防止惡意或異常資料。"""
    id: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=40)
    credits: float = Field(ge=0, le=100)
    time: str = Field(max_length=80)
    group: Optional[str] = None
    domain: Optional[str] = None
    teacher: str = Field(default="", max_length=100)
    location: str = Field(default="", max_length=100)
    grade: int = Field(default=0, ge=0, le=12)
    courseCode: Optional[str] = Field(default=None, max_length=32)
    gradeEligibility: Optional[str] = Field(default=None, max_length=80)


class SelectedCoursesPayload(BaseModel):
    """儲存選課的請求內容，最多 200 門課。"""
    courses: List[SelectedCourse] = Field(max_items=200)


# ===========================================================================
# 驗證（Authentication）相關
# ===========================================================================
def _prune_auth_sessions(now):
    """清除已過期的 session，避免記憶體無限增長。"""
    expired = [token for token, session in _auth_sessions.items() if session["expires_at"] <= now]
    for token in expired:
        del _auth_sessions[token]


def _auth_session(request):
    """從請求 cookie 取出對應的 session；沒登入或已過期則回傳 None。"""
    now = time.time()
    _prune_auth_sessions(now)  # 每次查詢前先清理過期 session
    token = request.cookies.get(AUTH_SESSION_COOKIE)
    return _auth_sessions.get(token)


@app.get("/api/auth/config")
def get_auth_config():
    """提供前端 Google Client ID，用來初始化 Google 登入按鈕。"""
    return {"client_id": GOOGLE_CLIENT_ID}


@app.post("/api/auth/google")
def sign_in_with_google(payload: GoogleCredential, request: FastAPIRequest, response: Response):
    """驗證 Google ID token，成功後建立 session 並以 cookie 回傳。"""
    try:
        # 向 Google 驗證 token 的簽章、有效期限與 audience（必須是本站 client id）
        claims = id_token.verify_oauth2_token(payload.credential, GoogleRequest(), GOOGLE_CLIENT_ID)
    except (ValueError, GoogleAuthError, TransportError) as error:
        raise HTTPException(status_code=401, detail="Google 登入驗證失敗，請重新登入") from error

    email = claims.get("email")
    subject = claims.get("sub")  # Google 帳號的唯一識別碼
    # 必須有 sub、email，且 email 已通過 Google 驗證
    if not subject or not email or claims.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Google 帳號缺少已驗證的電子郵件")

    user = {
        "id": subject,
        "name": claims.get("name") or email,  # 沒有名字就用 email 代替
        "email": email,
        "picture": claims.get("picture", ""),
    }
    now = time.time()
    _prune_auth_sessions(now)
    # 產生難以猜測的隨機 session token，並存入記憶體
    session_token = secrets.token_urlsafe(32)
    _auth_sessions[session_token] = {"user": user, "expires_at": now + AUTH_SESSION_SECONDS}
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        session_token,
        max_age=AUTH_SESSION_SECONDS,
        httponly=True,                          # JavaScript 無法讀取，降低 XSS 風險
        secure=request.url.scheme == "https",   # HTTPS 下才限定只透過加密連線傳送
        samesite="lax",                         # 限制跨站請求帶 cookie，降低 CSRF 風險
        path="/",
    )
    return {"user": user}


@app.get("/api/auth/me")
def get_current_user(request: FastAPIRequest):
    """回傳目前登入的使用者；未登入則 user 為 None。"""
    session = _auth_session(request)
    return {"user": session["user"] if session else None}


@app.post("/api/auth/logout")
def sign_out(request: FastAPIRequest, response: Response):
    """登出：刪除伺服器端 session 並清除 cookie。"""
    session_token = request.cookies.get(AUTH_SESSION_COOKIE)
    if session_token:
        _auth_sessions.pop(session_token, None)
    response.delete_cookie(AUTH_SESSION_COOKIE, httponly=True, samesite="lax", path="/")
    return {"user": None}


def _authenticated_user_id(request):
    """取得目前登入者的 id；未登入則回傳 401。需登入的 API 都用它把關。"""
    session = _auth_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="請先登入 Google 帳號")
    return session["user"]["id"]


# ===========================================================================
# 使用者選課資料的儲存（每位使用者一個 JSON 檔）
# ===========================================================================
def _selected_course_data(course):
    """把 SelectedCourse 轉成 dict，並過濾掉值為 None 的欄位。"""
    values = {
        "id": course.id,
        "name": course.name,
        "category": course.category,
        "credits": course.credits,
        "time": course.time,
        "group": course.group,
        "domain": course.domain,
        "teacher": course.teacher,
        "location": course.location,
        "grade": course.grade,
        "courseCode": course.courseCode,
        "gradeEligibility": course.gradeEligibility,
    }
    return {key: value for key, value in values.items() if value is not None}


def _user_data_path(user_id):
    """把 user_id 做 SHA-256 雜湊當檔名，避免使用者 ID 直接成為檔案路徑（防路徑穿越）。"""
    filename = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return USER_DATA_DIR / f"{filename}.json"


def _normalize_user_courses(courses):
    """驗證並整理從檔案/資料庫讀出的課程列表，格式不符就丟出 ValueError。"""
    if not isinstance(courses, list) or len(courses) > 200:
        raise ValueError("選課資料必須是最多 200 門課程的陣列")
    normalized = []
    for course in courses:
        if not isinstance(course, dict):
            raise ValueError("課程資料格式錯誤")
        # 透過 SelectedCourse 再驗證一次，確保讀出的資料也符合規則
        normalized.append(_selected_course_data(SelectedCourse(**course)))
    return normalized


def _save_user_courses_file(user_id, courses):
    """以「原子寫入」方式儲存使用者選課：先寫暫存檔，再替換正式檔。"""
    USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = _user_data_path(user_id)
    temporary_path = None
    try:
        # 暫存檔建立在同一資料夾，確保 os.replace 在同一檔案系統內是原子操作
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=USER_DATA_DIR,
            prefix=".user-courses-",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            json.dump(
                {
                    "user_id": user_id,
                    "courses": courses,
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
                temporary_file,
                ensure_ascii=False,  # 保留中文，不轉成 \uXXXX
                indent=2,
            )
            temporary_file.write("\n")
        # 寫完後才替換正式檔案，即使中途當機也不會留下損毀的檔案
        os.replace(temporary_path, path)
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"無法儲存使用者選課 JSON：{error}") from error
    finally:
        # 若寫入失敗，暫存檔還在，這裡負責清掉
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def _legacy_user_courses(user_id):
    """從舊版 SQLite 讀取使用者選課（用於遷移）；找不到資料則回傳 None。"""
    if not USER_DATA_DB.exists():
        return None
    try:
        # closing() 確保連線一定會被關閉
        with closing(sqlite3.connect(USER_DATA_DB, timeout=10)) as connection:
            row = connection.execute(
                "SELECT courses_json FROM user_selections WHERE user_id = ?",
                (user_id,),  # 使用參數化查詢，避免 SQL injection
            ).fetchone()
    except sqlite3.Error as error:
        # 資料表不存在視為沒有舊資料，其他錯誤才回報
        if "no such table" in str(error).lower():
            return None
        raise HTTPException(status_code=500, detail=f"無法讀取舊版選課資料：{error}") from error
    if not row:
        return None
    try:
        return _normalize_user_courses(json.loads(row[0]))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=500, detail=f"舊版選課資料格式錯誤：{error}") from error


@app.get("/api/user/courses")
def get_user_courses(request: FastAPIRequest):
    """讀取目前登入者的選課；優先讀 JSON，沒有則嘗試從舊版 SQLite 遷移。"""
    user_id = _authenticated_user_id(request)
    path = _user_data_path(user_id)
    if path.exists():
        try:
            user_data = json.loads(path.read_text(encoding="utf-8"))
            # 確認檔案內容是 dict，且 user_id 與登入者相符
            if (
                not isinstance(user_data, dict)
                or user_data.get("user_id") != user_id
            ):
                raise ValueError("使用者選課 JSON 格式錯誤")
            courses = _normalize_user_courses(user_data.get("courses"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError) as error:
            raise HTTPException(status_code=500, detail=f"無法讀取使用者選課 JSON：{error}") from error
        return {"courses": courses}

    # 沒有 JSON 檔：嘗試讀舊版資料，讀到的話順便轉存成 JSON（懶式遷移）
    courses = _legacy_user_courses(user_id)
    if courses is None:
        return {"courses": []}
    _save_user_courses_file(user_id, courses)
    return {"courses": courses}


@app.put("/api/user/courses")
def save_user_courses(payload: SelectedCoursesPayload, request: FastAPIRequest):
    """儲存目前登入者的選課；user_id 來自 session，不可能改到別人的資料。"""
    user_id = _authenticated_user_id(request)
    courses = [_selected_course_data(course) for course in payload.courses]
    _save_user_courses_file(user_id, courses)
    return {"courses": courses}


# ===========================================================================
# 課程資料載入與分類
# ===========================================================================
def _read_course_json(filename):
    """讀取 client/data 下的一個課程 JSON，並確認格式是「由 dict 組成的 list」。"""
    path = DATA / filename
    try:
        # utf-8-sig 可處理檔案開頭帶有 BOM 的情況
        records = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"無法讀取課程分類資料 {filename}：{error}") from error
    if not isinstance(records, list) or not all(isinstance(record, dict) for record in records):
        raise HTTPException(status_code=500, detail=f"課程分類資料 {filename} 格式錯誤")
    return records


def _course_sources():
    """讀取所有課程來源檔，並整理出最新學期的通識課程補充資訊（領域、學分）。"""
    common = _read_course_json("common.json")                # 校共同必修
    cs_courses = _read_course_json("cs_courses.json")        # 資工系課程
    general_courses = _read_course_json("general_courses.json")  # 通識課程清單
    general_domains = _read_course_json("general_domains.json")  # 通識領域/學分資料
    physical = _read_course_json("physical.json")            # 體育課程

    # 取通識資料中最新的學年度作為目前學期
    general_years = [record.get("year") for record in general_domains if record.get("year")]
    if not general_years:
        raise HTTPException(status_code=500, detail="通識分類資料缺少學年度")
    semester = max(general_years)
    # 以課號為 key，建立當學期通識課程的補充資訊對照表
    general_metadata_by_code = {
        record["course_id"]: record
        for record in general_domains
        if record.get("year") == semester and record.get("course_id") and record.get("domain")
    }

    return {
        "semester": semester,
        "common": common,
        "cs": cs_courses,
        "general": general_courses,
        "physical": physical,
        "general_metadata": general_metadata_by_code,
    }


def _load_local_courses():
    """把各來源的課程轉成統一格式、分類並寫入快取。"""
    global _course_cache, _course_cache_expires_at
    sources = _course_sources()
    courses = []
    # (來源名稱, 該來源的資料列)
    sources_by_group = (
        ("cs", sources["cs"]),
        ("common", sources["common"]),
        ("physical", sources["physical"]),
        ("general", sources["general"]),
    )
    # 記錄同一課號已出現幾次，用來替沒有班別欄位的來源自動編號
    generated_class_codes = {}

    for source, records in sources_by_group:
        for row in records:
            # 不同來源的欄位名稱不同：common/physical 用中文欄位，其餘用英文欄位
            if source in ("common", "physical"):
                course_code = str(row.get("課號", "")).strip()
                name = str(row.get("中文課名", "")).strip()
                class_code = str(row.get("班別", "")).strip()
                grade_eligibility = str(row.get("系統可選年級", "")).strip()
                time_slot = str(row.get("時間", "")).strip()
                teacher = str(row.get("開課教師", "")).strip()
                location = str(row.get("地點", "")).strip()
            else:
                course_code = str(row.get("course_id", "")).strip()
                name = str(row.get("course_name", "")).strip()
                grade_eligibility = str(row.get("grade", "")).strip()
                time_slot = str(row.get("time_slot", "")).strip()
                teacher = str(row.get("teacher", "")).strip()
                location = str(row.get("location", "")).strip()
                if course_code:
                    # 同課號第幾次出現就當作第幾班（0, 1, 2...）
                    class_index = generated_class_codes.get(course_code, 0)
                    class_code = str(class_index)
                    generated_class_codes[course_code] = class_index + 1

            if not course_code or not name:
                raise HTTPException(status_code=500, detail=f"本地課程資料 {source} 包含缺少課號或課名的資料列")

            # 從「系統可選年級」抽出第一個數字當作年級，抓不到則為 0
            grade_match = re.search(r"\d+", grade_eligibility)
            is_cs_required = "資工" in name  # 課名含「資工」視為資工系必修
            domain = None
            if source == "cs":
                # 在選修清單且課名不含「資工」→ 專業選修，否則專業必修
                category = "專業選修" if course_code in _CS_ELECTIVE_CODES and not is_cs_required else "專業必修"
                group = "資工系必選修"
                # 學分 = 時間欄位中英文字母（節次代碼）的數量
                credits = len(re.findall(r"[A-Za-z]", time_slot))
            elif source == "common":
                category = "校共同必修"
                group = "校共同必修"
                credits = len(re.findall(r"[A-Za-z]", time_slot))
            elif source == "physical":
                # 「體育」開頭的課視為特色運動（0 學分），其餘體育課 1 學分
                category = "特色運動" if name.startswith("體育") else "體育"
                group = "體育"
                credits = 0 if category == "特色運動" else 1
            else:
                # 通識：課名含「資工」的算專業必修，其餘為通識
                category = "專業必修" if is_cs_required else "通識"
                group = "通識"
                general_metadata = sources["general_metadata"].get(course_code, {})
                domain_name = general_metadata.get("domain", "")
                # 以領域代碼首字母對應到 人文/社會/自然/特色
                domain = _GENERAL_DOMAIN_AREAS.get(domain_name[:1])
                # 有明確學分就用，否則退回用節數計算
                credits = float(general_metadata["credits"]) if general_metadata.get("credits") else len(
                    re.findall(r"[A-Za-z]", time_slot)
                )

            courses.append({
                "id": f"{course_code}-{class_code}",  # 唯一識別：課號-班別
                "courseCode": course_code,
                "name": name,
                "category": category,
                "group": group,
                "domain": domain,
                "credits": credits,
                "time": time_slot,
                "teacher": teacher,
                "location": location,
                "grade": int(grade_match.group()) if grade_match else 0,
                "gradeEligibility": grade_eligibility,
            })

    if not courses:
        raise HTTPException(status_code=500, detail="本地課程資料沒有可用的課程")

    # 更新快取與到期時間
    _course_cache = {"semester": sources["semester"], "courses": courses}
    _course_cache_expires_at = time.monotonic() + COURSE_CACHE_SECONDS
    return _course_cache


def _load_courses():
    """取得課程資料（優先用快取）。使用雙重檢查鎖，避免同時多個請求重複載入。"""
    # 第一次檢查（不加鎖）：快取有效就直接回傳，速度最快
    if _course_cache is not None and time.monotonic() < _course_cache_expires_at:
        return _course_cache

    with _course_cache_lock:
        # 第二次檢查（加鎖後）：可能在等鎖期間已有其他執行緒載入完成
        if _course_cache is not None and time.monotonic() < _course_cache_expires_at:
            return _course_cache
        return _load_local_courses()


def _courses_for_group(group):
    """篩選出屬於某個分組（如「體育」）的課程，並附上學期資訊。"""
    course_data = _load_courses()
    return {
        "semester": course_data["semester"],
        "courses": [course for course in course_data["courses"] if course["group"] == group],
    }

# 四支課程api
@app.get("/api/courses/cs")
def get_cs_courses():
    """資工系必選修課程。"""
    return _courses_for_group("資工系必選修")


@app.get("/api/courses/physical")
def get_physical_courses():
    """體育課程。"""
    return _courses_for_group("體育")


@app.get("/api/courses/common")
def get_common_courses():
    """校共同必修課程。"""
    return _courses_for_group("校共同必修")


@app.get("/api/courses/general")
def get_general_courses():
    """通識課程。"""
    return _courses_for_group("通識")


app.mount("/css", StaticFiles(directory=CLIENT / "css"), name="css")
app.mount("/js", StaticFiles(directory=CLIENT / "js"), name="js")
app.mount("/data", StaticFiles(directory=CLIENT / "data"), name="data")
app.mount("/", StaticFiles(directory=CLIENT / "html", html=True), name="html")