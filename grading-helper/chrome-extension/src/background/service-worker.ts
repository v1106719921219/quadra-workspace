// Service Worker - Chrome拡張のバックグラウンドプロセス
// 現時点では最小限の実装。必要に応じて拡張

chrome.runtime.onInstalled.addListener(() => {
  console.log("Grading Helper extension installed");
});
