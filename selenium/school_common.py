"""
爬取暨大「本學期開課列表」x_deptid=98、x_division=B，只留中文課名包含「資工」、「(基礎)」或「(進階)」的課，輸出成 common.json。
需求: pip install selenium
"""
import json
import re
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import TimeoutException

URL = (
    "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"
    "?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid="
    "&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=98&z_division=LIKE&x_division=B"
    "&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers="
)
BASE_URL = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"
OUT_JSON = "common.json"
# 中文課名包含任一關鍵字就留下（比對前會先把全形括號（）換成半形 ()，所以兩種都能比中）
KEYWORDS = ["資工", "(基礎)", "(進階)"]
HEADLESS = True


def make_driver():
    opts = Options()
    if HEADLESS:
        opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1600,1000")
    opts.add_argument("--lang=zh-TW")
    return webdriver.Chrome(options=opts)


def find_course_table(driver):
    """挑出『資料列最多、且有表頭』的 table。"""
    best, best_rows = None, 0
    for t in driver.find_elements(By.TAG_NAME, "table"):
        rows = t.find_elements(By.XPATH, ".//tr[td]")
        has_head = t.find_elements(By.XPATH, ".//tr[th] | .//thead//td")
        if has_head and len(rows) > best_rows:
            best, best_rows = t, len(rows)
    return best


def parse_table(table):
    trs = table.find_elements(By.XPATH, "./thead/tr | ./tbody/tr | ./tr")
    headers, rows = [], []
    for tr in trs:
        ths = tr.find_elements(By.XPATH, "./th")
        tds = tr.find_elements(By.XPATH, "./td")
        if ths and not headers:
            headers = [re.sub(r"\s+", " ", th.text).strip() for th in ths]
        elif tds:
            cells = [re.sub(r"\s+", " ", td.text).strip() for td in tds]
            if any(cells):
                rows.append(cells)
    return headers, rows


def scrape():
    driver = make_driver()
    all_rows, headers = [], []
    seen = set()
    try:
        driver.get(URL)  # 先帶搜尋條件，之後用同一個 session 換頁
        page, start, page_size = 1, 1, None
        while True:
            try:
                WebDriverWait(driver, 15).until(lambda d: find_course_table(d) is not None)
            except TimeoutException:
                print("找不到課程表格，結束。")
                break

            h, rows = parse_table(find_course_table(driver))
            if not headers and h:
                headers = h

            sig = tuple(tuple(r) for r in rows)
            if not rows or sig in seen:
                break
            seen.add(sig)
            all_rows.extend(rows)
            print(f"第 {page} 頁：{len(rows)} 筆（累計 {len(all_rows)}）")

            if page_size is None:
                page_size = len(rows)
            if len(rows) < page_size:
                break
            start += page_size
            page += 1
            driver.get(f"{BASE_URL}?start={start}")
            time.sleep(0.5)
    finally:
        driver.quit()
    return headers, all_rows


def main():
    headers, rows = scrape()
    if not rows:
        print("沒有抓到資料。")
        return
    width = max(len(r) for r in rows)
    if len(headers) != width:
        headers = headers[:width] + [f"col{i+1}" for i in range(len(headers), width)]
    rows = [r + [""] * (width - len(r)) for r in rows]

    # 只留中文課名包含下列任一關鍵字的課（要加關鍵字就加在這裡）
    name_idx = next(
        (i for i, h in enumerate(headers) if "中文" in h and "名" in h),
        next((i for i, h in enumerate(headers) if "名稱" in h or "課名" in h), None),
    )
    if name_idx is None:
        print(f"找不到課名欄位，表頭是：{headers}，請改 name_idx")
        return
    rows = [
        r for r in rows
        if any(k in r[name_idx].replace("（", "(").replace("）", ")") for k in KEYWORDS)
    ]

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump([dict(zip(headers, r)) for r in rows], f, ensure_ascii=False, indent=2)
    print(f"完成，共 {len(rows)} 筆 → {OUT_JSON}")


if __name__ == "__main__":
    main()