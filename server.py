from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# 1. 優先掛載具體的靜態檔案路徑 (css、js)
app.mount("/css", StaticFiles(directory="client/css"), name="css")
app.mount("/js", StaticFiles(directory="client/js"), name="js")

# 2. 最後掛載根目錄 (HTML)
app.mount("/", StaticFiles(directory="client/html", html=True), name="html")