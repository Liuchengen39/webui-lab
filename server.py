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
CLIENT = Path(__file__).resolve().parent / "client"
DATA = CLIENT / "data"
USER_DATA_DIR = Path(__file__).resolve().parent / "user_data"
USER_DATA_DB = Path(__file__).resolve().parent / "user_data.sqlite3"
GOOGLE_CLIENT_ID = "609296002726-6qpc89smhfisnc7i2r81lr9r4jtc80fp.apps.googleusercontent.com"
AUTH_SESSION_COOKIE = "webui_lab_session"
AUTH_SESSION_SECONDS = 12 * 60 * 60
_auth_sessions = {}
COURSE_CACHE_SECONDS = 900
_course_cache = None
_course_cache_expires_at = 0.0
_course_cache_lock = Lock()
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
class GoogleCredential(BaseModel):
    credential: str = Field(min_length=1, max_length=10000)


class SelectedCourse(BaseModel):
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
    courses: List[SelectedCourse] = Field(max_items=200)


def _prune_auth_sessions(now):
    expired = [token for token, session in _auth_sessions.items() if session["expires_at"] <= now]
    for token in expired:
        del _auth_sessions[token]


def _auth_session(request):
    now = time.time()
    _prune_auth_sessions(now)
    token = request.cookies.get(AUTH_SESSION_COOKIE)
    return _auth_sessions.get(token)


@app.get("/api/auth/config")
def get_auth_config():
    return {"client_id": GOOGLE_CLIENT_ID}


@app.post("/api/auth/google")
def sign_in_with_google(payload: GoogleCredential, request: FastAPIRequest, response: Response):
    try:
        claims = id_token.verify_oauth2_token(payload.credential, GoogleRequest(), GOOGLE_CLIENT_ID)
    except (ValueError, GoogleAuthError, TransportError) as error:
        raise HTTPException(status_code=401, detail="Google 登入驗證失敗，請重新登入") from error

    email = claims.get("email")
    subject = claims.get("sub")
    if not subject or not email or claims.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Google 帳號缺少已驗證的電子郵件")

    user = {
        "id": subject,
        "name": claims.get("name") or email,
        "email": email,
        "picture": claims.get("picture", ""),
    }
    now = time.time()
    _prune_auth_sessions(now)
    session_token = secrets.token_urlsafe(32)
    _auth_sessions[session_token] = {"user": user, "expires_at": now + AUTH_SESSION_SECONDS}
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        session_token,
        max_age=AUTH_SESSION_SECONDS,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        path="/",
    )
    return {"user": user}


@app.get("/api/auth/me")
def get_current_user(request: FastAPIRequest):
    session = _auth_session(request)
    return {"user": session["user"] if session else None}


@app.post("/api/auth/logout")
def sign_out(request: FastAPIRequest, response: Response):
    session_token = request.cookies.get(AUTH_SESSION_COOKIE)
    if session_token:
        _auth_sessions.pop(session_token, None)
    response.delete_cookie(AUTH_SESSION_COOKIE, httponly=True, samesite="lax", path="/")
    return {"user": None}


def _authenticated_user_id(request):
    session = _auth_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="請先登入 Google 帳號")
    return session["user"]["id"]


def _selected_course_data(course):
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
    filename = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return USER_DATA_DIR / f"{filename}.json"


def _normalize_user_courses(courses):
    if not isinstance(courses, list) or len(courses) > 200:
        raise ValueError("選課資料必須是最多 200 門課程的陣列")
    normalized = []
    for course in courses:
        if not isinstance(course, dict):
            raise ValueError("課程資料格式錯誤")
        normalized.append(_selected_course_data(SelectedCourse(**course)))
    return normalized


def _save_user_courses_file(user_id, courses):
    USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = _user_data_path(user_id)
    temporary_path = None
    try:
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
                ensure_ascii=False,
                indent=2,
            )
            temporary_file.write("\n")
        os.replace(temporary_path, path)
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"無法儲存使用者選課 JSON：{error}") from error
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def _legacy_user_courses(user_id):
    if not USER_DATA_DB.exists():
        return None
    try:
        with closing(sqlite3.connect(USER_DATA_DB, timeout=10)) as connection:
            row = connection.execute(
                "SELECT courses_json FROM user_selections WHERE user_id = ?",
                (user_id,),
            ).fetchone()
    except sqlite3.Error as error:
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
    user_id = _authenticated_user_id(request)
    path = _user_data_path(user_id)
    if path.exists():
        try:
            user_data = json.loads(path.read_text(encoding="utf-8"))
            if (
                not isinstance(user_data, dict)
                or user_data.get("user_id") != user_id
            ):
                raise ValueError("使用者選課 JSON 格式錯誤")
            courses = _normalize_user_courses(user_data.get("courses"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError) as error:
            raise HTTPException(status_code=500, detail=f"無法讀取使用者選課 JSON：{error}") from error
        return {"courses": courses}

    courses = _legacy_user_courses(user_id)
    if courses is None:
        return {"courses": []}
    _save_user_courses_file(user_id, courses)
    return {"courses": courses}


@app.put("/api/user/courses")
def save_user_courses(payload: SelectedCoursesPayload, request: FastAPIRequest):
    user_id = _authenticated_user_id(request)
    courses = [_selected_course_data(course) for course in payload.courses]
    _save_user_courses_file(user_id, courses)
    return {"courses": courses}


def _read_course_json(filename):
    path = DATA / filename
    try:
        records = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"無法讀取課程分類資料 {filename}：{error}") from error
    if not isinstance(records, list) or not all(isinstance(record, dict) for record in records):
        raise HTTPException(status_code=500, detail=f"課程分類資料 {filename} 格式錯誤")
    return records


def _course_sources():
    common = _read_course_json("common.json")
    cs_courses = _read_course_json("cs_courses.json")
    general_courses = _read_course_json("general_courses.json")
    general_domains = _read_course_json("general_domains.json")
    physical = _read_course_json("physical.json")

    general_years = [record.get("year") for record in general_domains if record.get("year")]
    if not general_years:
        raise HTTPException(status_code=500, detail="通識分類資料缺少學年度")
    semester = max(general_years)
    domains_by_code = {
        record["course_id"]: record["domain"]
        for record in general_domains
        if record.get("year") == semester and record.get("course_id") and record.get("domain")
    }

    return {
        "semester": semester,
        "common": common,
        "cs": cs_courses,
        "general": general_courses,
        "physical": physical,
        "domains": domains_by_code,
    }


def _load_local_courses():
    global _course_cache, _course_cache_expires_at
    sources = _course_sources()
    courses = []
    sources_by_group = (
        ("cs", sources["cs"]),
        ("common", sources["common"]),
        ("physical", sources["physical"]),
        ("general", sources["general"]),
    )
    generated_class_codes = {}

    for source, records in sources_by_group:
        for row in records:
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
                    class_index = generated_class_codes.get(course_code, 0)
                    class_code = str(class_index)
                    generated_class_codes[course_code] = class_index + 1

            if not course_code or not name:
                raise HTTPException(status_code=500, detail=f"本地課程資料 {source} 包含缺少課號或課名的資料列")

            grade_match = re.search(r"\d+", grade_eligibility)
            is_cs_required = "資工" in name
            domain = None
            if source == "cs":
                category = "專業選修" if course_code in _CS_ELECTIVE_CODES and not is_cs_required else "專業必修"
                group = "資工系必選修"
                credits = len(re.findall(r"[A-Za-z]", time_slot))
            elif source == "common":
                category = "校共同必修"
                group = "校共同必修"
                credits = len(re.findall(r"[A-Za-z]", time_slot))
            elif source == "physical":
                category = "特色運動" if name.startswith("體育") else "體育"
                group = "體育"
                credits = 0 if category == "特色運動" else 1
            else:
                category = "專業必修" if is_cs_required else "通識"
                group = "通識"
                domain_name = sources["domains"].get(course_code, "")
                domain = _GENERAL_DOMAIN_AREAS.get(domain_name[:1])
                credits = len(re.findall(r"[A-Za-z]", time_slot))

            courses.append({
                "id": f"{course_code}-{class_code}",
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

    _course_cache = {"semester": sources["semester"], "courses": courses}
    _course_cache_expires_at = time.monotonic() + COURSE_CACHE_SECONDS
    return _course_cache


def _load_courses():
    if _course_cache is not None and time.monotonic() < _course_cache_expires_at:
        return _course_cache

    with _course_cache_lock:
        if _course_cache is not None and time.monotonic() < _course_cache_expires_at:
            return _course_cache
        return _load_local_courses()


def _courses_for_group(group):
    course_data = _load_courses()
    return {
        "semester": course_data["semester"],
        "courses": [course for course in course_data["courses"] if course["group"] == group],
    }


@app.get("/api/courses/cs")
def get_cs_courses():
    return _courses_for_group("資工系必選修")


@app.get("/api/courses/physical")
def get_physical_courses():
    return _courses_for_group("體育")


@app.get("/api/courses/common")
def get_common_courses():
    return _courses_for_group("校共同必修")


@app.get("/api/courses/general")
def get_general_courses():
    return _courses_for_group("通識")


app.mount("/css", StaticFiles(directory=CLIENT / "css"), name="css")
app.mount("/js", StaticFiles(directory=CLIENT / "js"), name="js")
app.mount("/data", StaticFiles(directory=CLIENT / "data"), name="data")

app.mount("/", StaticFiles(directory=CLIENT / "html", html=True), name="html")