const serverUrlInput = document.getElementById("serverUrl") as HTMLInputElement;
const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const savedMsg = document.getElementById("saved") as HTMLSpanElement;

// 保存済み値を読み込み
chrome.storage.sync.get(["serverUrl", "apiKey"], (result: Record<string, string>) => {
  serverUrlInput.value = result.serverUrl || "";
  apiKeyInput.value = result.apiKey || "";
});

saveBtn.addEventListener("click", () => {
  const serverUrl = serverUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  chrome.storage.sync.set({ serverUrl, apiKey }, () => {
    savedMsg.style.display = "inline-block";
    setTimeout(() => {
      savedMsg.style.display = "none";
    }, 2000);
  });
});
