"""
爬取暨大「本學期開課列表」(x_deptid=90) 並輸出成 JSON。

功能說明：
1. 從學校課程查詢系統抓取指定系所 / 單位的開課資料
2. 自動翻頁，收集所有課程
3. 最後只保留：
   - 中文課名包含「資工」
   - 或課名開頭是「體育:」
4. 輸出成 physical.json

需求：
    pip install selenium
Selenium 4.6+ 內建 Selenium Manager，通常可自動下載對應 chromedriver
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

# 查詢網址：x_deptid=90
URL = (
    "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"
    "?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid="
    "&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=90&z_division=LIKE&x_division="
    "&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers="
)

# 基底網址，後續翻頁時會用到
BASE_URL = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php"

# 輸出檔名
OUT_JSON = "physical.json"

# 是否使用無頭模式
HEADLESS = True  


def make_driver():
    """建立 Selenium Chrome driver。"""
    opts = Options()
    if HEADLESS:
        opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1600,1000")
        opts.add_argument("--lang=zh-TW")
    return webdriver.Chrome(options=opts)  


def find_course_table(driver):
    """
    從頁面中找出最像「課程列表」的 table。
    判斷方式：
    - 有表頭
    - 資料列數最多
    """
    best, best_rows = None, 0
    for t in driver.find_elements(By.TAG_NAME, "table"):
        rows = t.find_elements(By.XPATH, ".//tr[td]")
        has_head = t.find_elements(By.XPATH, ".//tr[th] | .//thead//td")
        if has_head and len(rows) > best_rows:
            best, best_rows = t, len(rows)
    return best  


def parse_table(table):
    """
    解析表格內容，回傳：
    - headers: 表頭列表
    - rows: 每一列資料
    只抓該 table 自己的 tr，避免巢狀 table 干擾。
    """
    trs = table.find_elements(By.XPATH, "./thead/tr | ./tbody/tr | ./tr")
    headers, rows = [], []

    for tr in trs:
        ths = tr.find_elements(By.XPATH, "./th")
        tds = tr.find_elements(By.XPATH, "./td")

        # 若這列是表頭，且 headers 尚未設定，就記錄表頭
        if ths and not headers:
            headers = [re.sub(r"\s+", " ", th.text).strip() for th in ths]

        # 若是資料列，就清理空白後加入 rows
        elif tds:
            cells = [re.sub(r"\s+", " ", td.text).strip() for td in tds]
            if any(cells):
                rows.append(cells)

    return headers, rows  


def scrape():
    """
    主爬蟲流程：
    1. 開啟第一頁
    2. 解析表格
    3. 依 start 參數翻頁
    4. 收集所有頁的資料
    """
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
    """主程式入口。"""
    headers, rows = scrape()

    if not rows:
        print("沒有抓到資料。")
        return

    # 找出最寬的列數，避免表頭與資料欄位數不一致
    width = max(len(r) for r in rows)

    # 若 headers 長度不足，補上預設欄位名
    if len(headers) != width:
        headers = headers[:width] + [f"col{i+1}" for i in range(len(headers), width)]
        rows = [r + [""] * (width - len(r)) for r in rows]

    # 找出課名欄位索引
    name_idx = next(
        (i for i, h in enumerate(headers) if "中文" in h and "名" in h),
        next((i for i, h in enumerate(headers) if "名稱" in h or "課名" in h), None),
    )

    if name_idx is None:
        print(f"找不到課名欄位，表頭是：{headers}，請手動調整 name_idx")
        return  

    def keep(name):
        """
        篩選條件：
        - 課名包含「資工」
        - 或課名開頭是「體育:」
        """
        name = name.strip()
        return "資工" in name or name.startswith(("體育:", "體育："))  

    # 只保留符合條件的列
    rows = [r for r in rows if keep(r[name_idx])]  

    # 輸出成 JSON
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump([dict(zip(headers, r)) for r in rows], f, ensure_ascii=False, indent=2)

    print(f"完成，共 {len(rows)} 筆 → {OUT_JSON}")  


if __name__ == "__main__":
    main()