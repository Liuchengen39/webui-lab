import json
import re
import time
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import TimeoutException

# 查詢網址：x_deptid=98、學士班(B)
URL = (
    "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"
    "?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid="
    "&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=98&z_division=LIKE&x_division=B"
    "&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers="
)

# 用來翻頁的基底網址
BASE_URL = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"

# 輸出檔名
OUT_JSON = "common.json"

# 中文課名包含任一關鍵字就保留
# 如果之後想加條件，直接在這個列表新增即可
KEYWORDS = ["資工", "(基礎)", "(進階)"]

# 是否啟用無頭模式
HEADLESS = True


def make_driver():
    opts = Options()
    if HEADLESS:
        opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1600,1000")
        opts.add_argument("--lang=zh-TW")
    return webdriver.Chrome(options=opts)


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def find_course_table(soup):
    best, best_rows = None, 0
    for table in soup.find_all("table"):
        data_rows = [tr for tr in table.find_all("tr") if tr.find("td")]
        has_head = table.find("th") or table.find("thead")
        if has_head and len(data_rows) > best_rows:
            best, best_rows = table, len(data_rows)
    return best


def parse_table(table):
    headers, rows = [], []

    for tr in table.find_all("tr"):
        ths = tr.find_all("th")
        tds = tr.find_all("td")

        if ths and not headers:
            headers = [clean(th.get_text()) for th in ths]
        elif tds:
            cells = [clean(td.get_text()) for td in tds]
            if any(cells):
                rows.append(cells)

    return headers, rows


def scrape():
    driver = make_driver()
    all_rows, headers = [], []
    seen = set()

    try:
        driver.get(URL)  # 先載入帶搜尋條件的第一頁
        page, start, page_size = 1, 1, None

        while True:
            try:
                WebDriverWait(driver, 15).until(
                    lambda d: find_course_table(
                        BeautifulSoup(d.page_source, "html.parser")
                    )
                    is not None
                )
            except TimeoutException:
                print("找不到課程表格，結束。")
                break

            soup = BeautifulSoup(driver.page_source, "html.parser")
            h, rows = parse_table(find_course_table(soup))

            if not headers and h:
                headers = h

            # 用整頁內容判斷是否重複
            sig = tuple(tuple(r) for r in rows)
            if not rows or sig in seen:
                break

            seen.add(sig)
            all_rows.extend(rows)
            print(f"第 {page} 頁：{len(rows)} 筆（累計 {len(all_rows)}）")

            # 第一次以當頁筆數作為 page_size
            if page_size is None:
                page_size = len(rows)

            # 若本頁筆數少於 page_size，表示最後一頁
            if len(rows) < page_size:
                break

            # 換到下一頁
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

    # 統一欄位寬度
    width = max(len(r) for r in rows)
    if len(headers) != width:
        headers = headers[:width] + [f"col{i+1}" for i in range(len(headers), width)]
        rows = [r + [""] * (width - len(r)) for r in rows]

    # 找課名欄位
    name_idx = next(
        (i for i, h in enumerate(headers) if "中文" in h and "名" in h),
        next((i for i, h in enumerate(headers) if "名稱" in h or "課名" in h), None),
    )

    if name_idx is None:
        print(f"找不到課名欄位，表頭是：{headers}，請改 name_idx")
        return

    # 只保留課名包含任一關鍵字的課程
    rows = [
        r for r in rows
        if any(k in r[name_idx].replace("（", "(").replace("）", ")") for k in KEYWORDS)
    ]

    # 輸出成 JSON
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump([dict(zip(headers, r)) for r in rows], f, ensure_ascii=False, indent=2)

    print(f"完成，共 {len(rows)} 筆 → {OUT_JSON}")


if __name__ == "__main__":
    main()