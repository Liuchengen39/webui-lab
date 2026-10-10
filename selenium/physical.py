"""
爬取暨大「本學期開課列表」(資工系 x_deptid=90) 並輸出成 JSON。
需求: pip install selenium
(Selenium 4.6+ 內建 Selenium Manager，會自動下載對應的 chromedriver)
"""
import json
import re
import time
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
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


def find_course_table(driver):
    """挑出『資料列最多、且有表頭』的 table，通常就是課程列表。"""
    best, best_rows = None, 0
    for t in driver.find_elements(By.TAG_NAME, "table"):
        rows = t.find_elements(By.XPATH, ".//tr[td]")
        has_head = t.find_elements(By.XPATH, ".//tr[th] | .//thead//td")
        if has_head and len(rows) > best_rows:
            best, best_rows = t, len(rows)
    return best


def parse_table(table):
    """回傳 (headers, rows)。巢狀 table 會被排除，只取該 table 自己的 tr。"""
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


def click_next(driver):
    """嘗試點『下一頁』(PHPMaker 的 pager)。成功回傳 True。"""
    xpaths = [
        "//a[contains(@href,'start=')][.//img[contains(translate(@alt,'NEXT','next'),'next')]]",
        "//a[contains(@href,'start=')][contains(.,'下一頁') or contains(.,'下一页')]",
        "//a[contains(@href,'start=')][normalize-space(.)='>' or normalize-space(.)='›' or normalize-space(.)='Next']",
        "//div[contains(@class,'ewPager')]//a[contains(@href,'start=')][last()]",
    ]
    for xp in xpaths:
        links = driver.find_elements(By.XPATH, xp)
        for a in links:
            if a.is_displayed() and a.get_attribute("href"):
                a.click()
                return True
    return False


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
                    lambda d: find_course_table(d) is not None
                )
            except TimeoutException:
                print("找不到課程表格，結束。")
                break

            table = find_course_table(driver)
            h, rows = parse_table(table)
            if not headers and h:
                headers = h

            sig = tuple(tuple(r) for r in rows)
            if not rows or sig in seen_signatures:
                break  # 沒資料或重複頁 → 已到最後一頁
            seen_signatures.add(sig)
            all_rows.extend(rows)
            print(f"第 {page} 頁：{len(rows)} 筆（累計 {len(all_rows)}）")

            # 這個網站的分頁是 ?start=1, 21, 41...（每頁筆數 = 第一頁的列數）
            # 不靠點按鈕，直接用同一個 driver（保留搜尋條件的 session）換頁
            if page_size is None:
                page_size = len(rows)
            if len(rows) < page_size:
                break  # 最後一頁
            start += page_size
            page += 1
            driver.get(f"{BASE_URL}?start={start}")
            time.sleep(0.5)  # 對學校伺服器客氣一點
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
    # 只留：中文課名包含「資工」，或課名開頭是「體育:」（半形/全形冒號都算）
    name_idx = next(
        (i for i, h in enumerate(headers) if "中文" in h and "名" in h),
        next((i for i, h in enumerate(headers) if "名稱" in h or "課名" in h), None),
    )
    if name_idx is None:
        print(f"找不到課名欄位，表頭是：{headers}，請改 name_idx")
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