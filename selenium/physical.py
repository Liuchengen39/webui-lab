import json
import re
import time
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import TimeoutException

URL = (
    "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"
    "?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid="
    "&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=90&z_division=LIKE&x_division="
    "&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers="
)

BASE_URL = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"

OUT_JSON = "physical.json"

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
    seen_signatures = set()

    try:
        driver.get(URL)
        page = 1
        start = 1
        page_size = None

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
            table = find_course_table(soup)
            h, rows = parse_table(table)

            # 第一次成功解析到表頭時記錄
            if not headers and h:
                headers = h

            # 將本頁資料轉成 tuple，方便檢查是否重複
            sig = tuple(tuple(r) for r in rows)

            # 沒資料或頁面重複，代表到底了
            if not rows or sig in seen_signatures:
                break

            seen_signatures.add(sig)
            all_rows.extend(rows)
            print(f"第 {page} 頁：{len(rows)} 筆（累計 {len(all_rows)}）")

            # 這個網站的分頁規則是 ?start=1, 21, 41...
            # 第一頁抓到幾筆，就當作每頁筆數
            if page_size is None:
                page_size = len(rows)

            # 若當前頁筆數小於每頁筆數，表示已到最後一頁
            if len(rows) < page_size:
                break

            # 前往下一頁
            start += page_size
            page += 1
            driver.get(f"{BASE_URL}?start={start}")
            time.sleep(0.5)  # 稍微放慢，避免對學校伺服器造成太大負擔

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

    name_idx = next(
        (i for i, h in enumerate(headers) if "中文" in h and "名" in h),
        next((i for i, h in enumerate(headers) if "名稱" in h or "課名" in h), None),
    )

    if name_idx is None:
        print(f"找不到課名欄位，表頭是：{headers}，請手動調整 name_idx")
        return

    def keep(name):
        name = name.strip()
        return "資工" in name or name.startswith(("體育:", "體育："))

    rows = [r for r in rows if keep(r[name_idx])]

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump([dict(zip(headers, r)) for r in rows], f, ensure_ascii=False, indent=2)

    print(f"完成，共 {len(rows)} 筆 → {OUT_JSON}")


if __name__ == "__main__":
    main()