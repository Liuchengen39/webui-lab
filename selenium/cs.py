import json
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

url = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid=&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=21&z_division=LIKE&x_division=B&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers="

service = Service(ChromeDriverManager().install())
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")

driver = webdriver.Chrome(service=service, options=options)

page_num = 1
total_count = 0
all_courses = []

try:
    print("正在開啟網頁並讀取資工系【學士班】課程...")
    driver.get(url)

    while True:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "table"))
        )
        time.sleep(2)

        soup = BeautifulSoup(driver.page_source, "html.parser")
        table = soup.find("table")
        if not table:
            break

        print("\n" + "=" * 70)
        print(f"  第 {page_num} 頁課程清單")
        print("=" * 70)

        rows = table.find_all("tr")

        for idx, row in enumerate(rows):
            cols = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]

            if not cols:
                continue

            if idx == 0 and page_num == 1:
                continue

            if cols[0] in ["檢視", ""]:
                cols = cols[1:]

            if len(cols) < 9:
                continue

            course = {
                "source": "cs",
                "course_id": cols[0],
                "course_name": cols[2],
                "grade": cols[5],
                "teacher": cols[6],
                "location": cols[7] if cols[7] else "無",
                "time_slot": cols[8] if cols[8] else "無"
            }

            all_courses.append(course)
            total_count += 1

        try:
            next_buttons = driver.find_elements(
                By.XPATH,
                "//a[contains(text(), '下一頁') or contains(@title, '下一頁') or contains(text(), '>')]"
            )

            valid_next_btn = None
            for btn in next_buttons:
                if btn.is_displayed() and "disabled" not in (btn.get_attribute("class") or ""):
                    valid_next_btn = btn
                    break

            if valid_next_btn:
                print("\n[系統] 點擊前往下一頁...\n")
                valid_next_btn.click()
                page_num += 1
            else:
                print("\n[系統] 已到達最後一頁,爬取結束。")
                break

        except Exception as e:
            print(f"\n[系統] 結束翻頁: {e}")
            break

finally:
    driver.quit()

    with open("cs_courses.json", "w", encoding="utf-8") as f:
        json.dump(all_courses, f, ensure_ascii=False, indent=2)

    print(f"\n全部爬取完畢!總共輸出 {total_count} 筆課程資料到 cs_courses.json")