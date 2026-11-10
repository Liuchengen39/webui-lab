# WebUI Lab

Web Programming課程實作專案。

## 學號
S115321012

## Google 登入

安裝專案依賴後啟動應用程式：

```powershell
pip install -r requirements.txt
uvicorn server:app --reload
```

在 Google Cloud Console 的 OAuth 用戶端中，將實際使用的網站來源加入「已授權的 JavaScript 來源」，例如本機的 `http://localhost:8000` 和 `http://127.0.0.1:8000`。如果使用不同連接埠或正式網域，也必須加入瀏覽器網址列中的完整來源。部署時請填入正式網站來源（包含協定與連接埠，如有）。本專案使用 Google Identity Services 彈出式登入，無須設定重新導向 URI 或 Client Secret；伺服器會驗證 Google ID token，並以 HttpOnly Cookie 建立登入工作階段。