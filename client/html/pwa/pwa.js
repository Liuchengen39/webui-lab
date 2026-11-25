if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("service-worker.js", document.baseURI);
    const scope = new URL("./", document.baseURI).pathname;

    navigator.serviceWorker.register(serviceWorkerUrl, { scope }).catch((error) => {
      console.error("Service Worker 註冊失敗：", error);
    });
  });
}
