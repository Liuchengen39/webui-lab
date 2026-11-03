import json
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup  

# 目標網址：
# 抓取暨大本學期開課列表中，資工系（x_deptid=21）學士班（x_division=B）課程
url = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid=&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=21&z_division=LIKE&x_division=B&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers="  

# 自動下載並設定 ChromeDriver
service = Service(ChromeDriverManager().install())

# 設定瀏覽器為無頭模式
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")  

# 建立瀏覽器 driver
driver = webdriver.Chrome(service=service, options=options)  

# 初始化頁數與資料容器
page_num = 1
total_count = 0
all_courses = []  

try:
    print("正在開啟網頁並讀取資工系【學士班】課程...")
    driver.get(url)  

    while True:
        # 等待表格出現
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "table"))
        )

        # 額外等待，確保分頁切換後內容完整載入
        time.sleep(2)  

        # 用 BeautifulSoup 解析目前頁面
        soup = BeautifulSoup(driver.page_source, "html.parser")
        table = soup.find("table")

        # 若找不到表格則停止
        if not table:
            break  

        print("\n" + "=" * 70)
        print(f"  第 {page_num} 頁課程清單")
        print("=" * 70)  

        rows = table.find_all("tr")  

        # 逐列解析表格
        for idx, row in enumerate(rows):
            cols = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]  

            # 空列直接跳過
            if not cols:
                continue  

            # 第一頁第一列通常是表頭，略過
            if idx == 0 and page_num == 1:
                continue  

            # 某些列前面有「檢視」欄位，去掉
            if cols[0] in ["檢視", ""]:
                cols = cols[1:]  

            # 欄位數不足代表不是完整課程資料
            if len(cols) < 9:
                continue  

            # 整理成統一格式
            course = {
                "source": "cs",                   # 資料來源標記
                "course_id": cols[0],            # 課號
                "course_name": cols[2],          # 課名
                "grade": cols[5],                # 年級
                "teacher": cols[6],              # 授課教師
                "location": cols[7] if cols[7] else "無",  # 上課地點
                "time_slot": cols[8] if cols[8] else "無"  # 上課時間
            }  

            all_courses.append(course)
            total_count += 1  

        # 嘗試尋找「下一頁」按鈕
        try:
            next_buttons = driver.find_elements(
                By.XPATH,
                "//a[contains(text(), '下一頁') or contains(@title, '下一頁') or contains(text(), '>')]"
            )  

            valid_next_btn = None

            # 找出可見且未停用的下一頁按鈕
            for btn in next_buttons:
                if btn.is_displayed() and "disabled" not in (btn.get_attribute("class") or ""):
                    valid_next_btn = btn
                    break  

            if valid_next_btn:
                print("\n[系統] 點擊前往下一頁...\n")
                valid_next_btn.click()
                page_num += 1
            else:
                print("\n[系統] 已到達最後一頁，爬取結束。")
                break  

        except Exception as e:
            # 若翻頁過程出錯，輸出錯誤資訊後停止
            print(f"\n[系統] 結束翻頁: {e}")
            break  

finally:
    # 關閉瀏覽器
    driver.quit()  

# 將抓到的課程資料輸出成 JSON
with open("cs_courses.json", "w", encoding="utf-8") as f:
    json.dump(all_courses, f, ensure_ascii=False, indent=2)  

print(f"\n全部爬取完畢！總共輸出 {total_count} 筆課程資料到 cs_courses.json")