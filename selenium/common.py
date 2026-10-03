import json
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

base_url = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid=&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=99&z_division=LIKE&x_division=B&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers=&start="

service = Service(ChromeDriverManager().install())
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")

driver = webdriver.Chrome(service=service, options=options)

page_num = 1
start_index = 1
total_count = 0
last_first_course_id = None
all_courses = []

try:
    print("正在開啟網頁並爬取【通識課程 (x_deptid=99)】...")

    while True:
        current_url = f"{base_url}{start_index}"
        driver.get(current_url)

        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "table"))
        )

        soup = BeautifulSoup(driver.page_source, "html.parser")
        table = soup.find("table")
        if not table:
            break

        rows = table.find_all("tr")
        page_courses = []

        for idx, row in enumerate(rows):
            cols = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
            if not cols or len(cols) < 10:
                continue

            if cols[0] in ["檢視", ""]:
                cols = cols[1:]

            if cols[0] in ["課號", "課程代碼"]:
                continue

            page_courses.append(cols)

        if not page_courses:
            print(f"\n[系統] 第 {page_num} 頁已無資料,爬取結束。")
            break

        current_first_course_id = page_courses[0][0]
        if current_first_course_id == last_first_course_id:
            print("\n[系統] 已到達最後一頁,自動停止爬取!")
            break

        last_first_course_id = current_first_course_id

        for cols in page_courses:
            course = {
                "source": "general",
                "course_id": cols[0],
                "course_name": cols[2],
                "grade": cols[5],
                "teacher": cols[6],
                "location": cols[7] if cols[7] else "無",
                "time_slot": cols[8] if cols[8] else "無"
            }
            all_courses.append(course)
            total_count += 1

        start_index += 20
        page_num += 1
        time.sleep(1)

finally:
    driver.quit()

    with open("general_courses.json", "w", encoding="utf-8") as f:
        json.dump(all_courses, f, ensure_ascii=False, indent=2)

    print(f"\n爬取完成!總共輸出 {total_count} 筆【通識課程】到 general_courses.json")