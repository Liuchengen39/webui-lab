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
# 抓取暨大「本學期開課列表」中，x_deptid=99（通識課程）、x_division=B 的資料
# start 參數用來控制分頁起始位置
base_url = "https://ccweb6.ncnu.edu.tw/student/current_semester_opened_listlist.php?cmd=search&t=current_semester_opened_list&z_courseid=%3D&x_courseid=&z_cname=LIKE&x_cname=&z_deptid=%3D&x_deptid=99&z_division=LIKE&x_division=B&z_grade=%3D&x_grade=&z_teachers=LIKE&x_teachers=&start="  

# 自動安裝並設定 ChromeDriver
service = Service(ChromeDriverManager().install())

# 建立 Chrome 選項，使用無頭模式（不開啟瀏覽器視窗）
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")  

# 建立瀏覽器 driver
driver = webdriver.Chrome(service=service, options=options)  

# 分頁與統計用變數初始化
page_num = 1              # 目前頁數
start_index = 1           # 分頁起始索引
total_count = 0           # 累計抓到的課程數
last_first_course_id = None  # 用來判斷是否重複抓到最後一頁
all_courses = []          # 儲存所有課程資料

try:
    print("正在開啟網頁並爬取【通識課程 (x_deptid=99)】...")  

    while True:
        # 組合目前要抓取的頁面網址
        current_url = f"{base_url}{start_index}"
        driver.get(current_url)  

        # 等待頁面中的 table 載入完成
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "table"))
        )  

        # 取得網頁原始碼並交給 BeautifulSoup 解析
        soup = BeautifulSoup(driver.page_source, "html.parser")
        table = soup.find("table")

        # 如果找不到表格，代表沒有資料可抓，結束
        if not table:
            break  

        rows = table.find_all("tr")
        page_courses = []  # 暫存本頁課程資料

        # 逐列解析表格內容
        for idx, row in enumerate(rows):
            cols = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]

            # 欄位數太少，通常不是有效資料列，跳過
            if not cols or len(cols) < 10:
                continue  

            # 有些列前面會多一個「檢視」欄位，移除它
            if cols[0] in ["檢視", ""]:
                cols = cols[1:]  

            # 略過表頭列
            if cols[0] in ["課號", "課程代碼"]:
                continue  

            # 將處理後的欄位加入本頁資料
            page_courses.append(cols)  

        # 如果這一頁沒有課程資料，代表已經到底
        if not page_courses:
            print(f"\n[系統] 第 {page_num} 頁已無資料，爬取結束。")
            break  

        # 取本頁第一筆課號，用來判斷是否重複頁面
        current_first_course_id = page_courses[0][0]

        # 若與上一頁第一筆課號相同，表示分頁重複，停止抓取
        if current_first_course_id == last_first_course_id:
            print("\n[系統] 已到達最後一頁，自動停止爬取!")
            break  

        # 更新上一頁第一筆課號
        last_first_course_id = current_first_course_id  

        # 將本頁課程轉成字典格式，方便輸出成 JSON
        for cols in page_courses:
            course = {
                "source": "general",               # 資料來源標記
                "course_id": cols[0],             # 課號
                "course_name": cols[2],           # 課名
                "grade": cols[5],                 # 年級
                "teacher": cols[6],               # 教師
                "location": cols[7] if cols[7] else "無",   # 上課地點
                "time_slot": cols[8] if cols[8] else "無"   # 上課時間
            }
            all_courses.append(course)
            total_count += 1  

        # 下一頁（該網站每頁 20 筆）
        start_index += 20
        page_num += 1

        # 稍微暫停，避免過快請求網站
        time.sleep(1)  

finally:
    # 無論成功或失敗，都關閉瀏覽器
    driver.quit()  

# 將所有課程資料寫入 JSON 檔案
with open("general_courses.json", "w", encoding="utf-8") as f:
    json.dump(all_courses, f, ensure_ascii=False, indent=2)  

print(f"\n爬取完成！總共輸出 {total_count} 筆【通識課程】到 general_courses.json")