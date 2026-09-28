from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# 1. 先掛載特定的靜態檔案目錄 (CSS, JS 等)
app.mount("/css", StaticFiles(directory="client/css"), name="css")
app.mount("/js", StaticFiles(directory="client/js"), name="js")

# 2. 最後才掛載 HTML 根目錄 (會涵蓋 client/html 下的所有 .html 檔案)
app.mount("/", StaticFiles(directory="client/html", html=True), name="html")