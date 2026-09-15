# W01 Learning Log — Web

## 1. 本週 Project Goal
完成 repo 初始化與前端基礎資料夾結構設定。

## 2. 本週完成
- [x] `node --version`、`npm --version`、`git --version`都有輸出
- [x] 專案資料夾建在`code`下，VSCode能開啟
- [x] `.gitignore`是第一個建立的檔案
- [x] `git log --oneline`看得到你的第一個commit
- [x] GitHub上看得到你的repo與README

## 3. Web Concept of the Week
開啟html不能直接按兩下打開，會顯示 file:// 協定，用 http-server 開啟時,是用的是 http:// 協定。
因為瀏覽器對 file:// 頁面有比較嚴格的安全限制，原因是「直接打開電腦裡的檔案」被視為風險較高的情境(理論上這個檔案可能透過相對路徑去讀取你電腦裡其他敏感檔案)。所以很多瀏覽器在 file:// 底下會擋掉某些功能,例如:fetch() 呼叫其他檔案(例如讀取一個本機的 JSON 檔案)常常會被擋,出現 CORS 相關錯誤。

## 4. Debugging Record
Problem: 執行 npm install / npm run dev 報錯
Error / symptom: ENOENT，找不到 package.json
Root cause: 專案目前是純 HTML/CSS/JS，還沒有用 npm 初始化（沒有 package.json），
且指令執行路徑也不在專案資料夾內
How I found it: 讀錯誤訊息裡顯示的路徑，發現不是專案資料夾
Fix: 確認現階段不需要 npm，改用 npx http-server 直接跑靜態檔案；
之後 W09-10 做後端時才會需要 npm init

## 5. Security Check
.gitignore 從第一天就排除 node_modules/、.env，
因為 git commit 是永久的，事後才排除已經來不及清掉歷史紀錄，
所以要在檔案產生之前就先設定好。

## 6. Reflection
這週 AI 最有幫助的地方：解釋每個指令實際在做什麼（而不是只給指令），
讓我理解如果要上傳檔案同步到github背後流程。
