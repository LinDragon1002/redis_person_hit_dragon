# 龍王 vs 勇者 - 戰鬥指揮中心 (Dragon vs. Hero Battle Arena)

這是一個結合 **Python Flask (後端)**、**Pygame (遊戲邏輯)** 與 **Socket.IO (即時通訊)** 的網頁回合制戰鬥遊戲。

玩家可以在網頁上觀看勇者與龍王的自動/手動對決，系統會透過 Redis 記錄詳細的戰鬥數據、回放紀錄與排行榜。

---
## 啟動伺服器

```bash
python app.py
```
---

## 專案特色

* **雙模式核心**：
    * **網頁模式 (Web)**：透過 WebSocket 實時串流戰鬥數據，前端 JS 呈現動畫特效。
    * **Pygame 模式 (Local)**：在本機執行時，可喚醒獨立的 Pygame 視窗進行遊玩。
* **即時戰況**：使用 Flask-SocketIO 實現低延遲的血量更新與戰鬥日誌。
* **數據持久化**：
    * 使用 **Redis** 儲存所有戰鬥歷史、勝率統計與角色狀態。
    * **Redis Stream** 實作完整的戰鬥回放系統 (Replay)。
    * **Redis Sorted Sets** 實作即時排行榜 (最高傷害、最長回合)。
* **部署優化**：支援在無螢幕 (Headless) 的雲端伺服器 (如 Render) 上運行 Pygame 邏輯。

---

## 技術堆疊

* **語言**: Python 3.11.9
* **網頁框架**: Flask
* **即時通訊**: Flask-SocketIO, Eventlet
* **遊戲引擎**: Pygame (用於後端邏輯運算與本機顯示)
* **資料庫**: Redis (快取、統計、串流)
* **前端**: HTML5, CSS3 (Cyberpunk 風格), JavaScript, Socket.IO Client

---

## 環境要求與安裝

### 1. Python 版本
建議使用 **Python 3.11.9**

### 2. 安裝套件
請確保專案根目錄有 `requirements.txt`，並執行：

```bash
pip install -r requirements.txt
```
需要自行建立 `.env` 檔案

```# .env 範例
host=127.0.0.1
port=6379
password=...
```

---

## 專案結構

```
Project/
├── app.py                # 程式入口，Flask 與 SocketIO 設定
├── main.py               # 遊戲主迴圈與邏輯 (Pygame integration)
├── web_game_logic.py     # 專為網頁版設計的遊戲類別 (Headless Pygame)
├── characters.py         # 角色類別、技能與 Redis Stream 寫入
├── database.py           # Redis 連線與數據存取函式
├── config.py             # 讀取環境變數與全域設定
├── static/               # 前端資源
│   ├── css/              # 樣式表 (style.css, battle.css...)
│   ├── js/               # 前端邏輯 (game.js, api.js, ui.js...)
│   └── images/           # 遊戲圖片與音效
└── templates/            # HTML 模板
    ├── index.html        # 主頁面
    ├── leaderboard.html  # 排行榜
    └── history.html      # 歷史紀錄
```

