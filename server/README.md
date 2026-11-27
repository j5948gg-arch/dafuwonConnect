# FGO 連線伺服器（Supabase 版）

> 這一版把帳號、雲端存檔、積分改存 **Supabase**（Postgres＋Auth），伺服器本身**不再需要硬碟**。
> Supabase 負責資料；這個 Node 程式（WebSocket 配對與對戰轉送）要放在能常駐執行的主機（Render／Fly.io／Railway／VPS）。
> 前端遊戲檔（gacha.html）不用改，API 與舊版相同。

## Supabase 版部署步驟
1. Supabase 建立專案 → **SQL Editor** 貼上 `supabase/schema.sql` 執行一次。
2. **Settings → API Keys** 取得 `Project URL`、`anon`（publishable）、`service_role`（secret）。
3. **Authentication → Sign In / Providers → Email**：關閉「Confirm email」不影響（伺服器用 admin API 建帳號，已自動確認）；建議關閉「Allow new users to sign up」，避免有人繞過遊戲伺服器直接向 Supabase 註冊。
4. 在主機設定環境變數：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`GM_USER`、`GM_PASS`（其餘見下表）。`service_role` 金鑰只能放這裡，**不可** commit 到 GitHub。
5. 啟動後 log 出現 `FGO server listening` 即完成；第一次啟動會自動建立 GM 帳號。


提供：帳號（註冊／登入）、雲端存檔、連線對戰（快速配對／房間代碼）、積分（Elo）與排行榜。
只依賴 Node.js 18+ 與 `ws`。遊戲檔 `gacha.html` 由同一個伺服器提供，所以玩家直接開伺服器網址就能玩。

## 快速啟動
```bash
cd server
npm install
# public/gacha.html 已附上最新版；用 game/遊戲原始碼/gen.py 重新產生遊戲時會自動同步到這裡
npm start            # 預設 http://localhost:3000
```
開兩個不同的瀏覽器（或一個一般視窗＋一個無痕視窗）開 `http://localhost:3000` →「對戰」→「連線對戰」→ 各註冊一個帳號 → 其中一人按「快速配對」、另一人也按，就會配對成功。
（同一個瀏覽器的兩個分頁會共用登入記錄，測試請用不同瀏覽器或無痕視窗。）

## 環境變數
| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 3000 | 監聽埠 |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 必填 | Supabase 專案連線資訊 |
| `SECRET` | 由 service_role 金鑰衍生 | 登入憑證簽章金鑰（可自訂；更換後所有人需重新登入） |
| `GAME_FILE` | `./public/gacha.html` | 要提供給玩家的遊戲檔 |
| `PVP_MUL` | 10 | 連線對戰雙方生命倍率（由伺服器統一下發，兩端一致） |
| `HONOR_CAP` | 500 | 連線對戰每人每日榮譽上限（伺服器統計） |
| `TZ_OFFSET_HOURS` | 8 | 「每日」換日用的時區（8＝台灣，凌晨 0 點重置） |
| `DRAFT_SEC` / `TURN_SEC` | 15 / 30 | 選角每輪秒數／每次出招限時 |
| `CORS_ORIGIN` | `*` | 遊戲檔與伺服器不同網域時才需要設定 |
| `GM_USER` | `GM` | GM 測試帳號名稱（啟動時自動建立；2～16 字） |
| `GM_PASS` | 無 | GM 帳號密碼。有設定＝每次啟動都以它為準（改環境變數即可改密碼）；沒設定＝第一次啟動產生隨機密碼並印在 log（只印一次） |

## 正式上線
1. **一定要用 HTTPS／WSS**（密碼與登入憑證會經過網路）。常見做法是 Nginx 反向代理：
```nginx
server {
  listen 443 ssl http2;
  server_name game.example.com;
  # ssl_certificate ... （Let's Encrypt）
  client_max_body_size 4m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # WebSocket 必要
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 3600s;
  }
}
```
2. 讓程式常駐：`npm i -g pm2 && pm2 start server.js --name fgo`，或用附的 `Dockerfile`：
```bash
docker build -t fgo-server . && docker run -d -p 3000:3000 -v fgo-data:/data --restart=always fgo-server
```
3. **GM 測試帳號與測試發放**：原本寫在 `tpl.html` 的 `DEV_GRANT`（對每個存檔發放全角色）已移除，改成只有 GM 帳號（`role='gm'`）登入後才發放（`applyGM()`）。一般玩家只拿到新手角色與新手教學獎勵。上線前請確認 `GM_PASS` 用強密碼。
4. 更新遊戲：重新 `gen.py`（會自動更新 `public/gacha.html`）→ 重啟（玩家重新整理）。版本碼（`BUILD`）不同的玩家不能互相配對，避免兩端規則不一致。


## 部署到 Render
（Supabase 版：不需要 Persistent Disk，下列第 4 點已不適用。）
repo 根目錄已附 `render.yaml`（Blueprint）。步驟：
1. 把整個 repo 推到 GitHub（`server/public/gacha.html` 要一起 commit；步驟見根目錄 README.md）。
2. Render → New → Blueprint → 選這個 repo → 套用。它會建立一個 Web Service（Root Directory 為 `server`、Build `npm install`、Start `node server.js`），並自動產生 `SECRET`。
3. 部署完成後直接開 Render 給的 `https://xxx.onrender.com`，Render 預設就是 HTTPS／WSS，不用另外設 Nginx。
4. **務必掛 Persistent Disk**（`render.yaml` 已設好：掛載在 `/var/data`、`DATA_DIR=/var/data`）。帳號、雲端存檔、積分都存在這顆硬碟；沒有硬碟的話，Render 每次重新部署或重啟都會清空，所有帳號與雲端存檔會消失。
   - Persistent Disk 需要付費方案（Starter 以上）。免費方案沒有硬碟，也會在閒置約 15 分鐘後休眠（休眠會斷開所有 WebSocket，喚醒要等數十秒），只適合試玩，不適合正式開放。
5. 更新遊戲：重新跑 `gen.py`（會自動更新 `server/public/gacha.html`）→ commit & push → Render 自動重新部署（對戰中的玩家會斷線，建議挑沒人的時段）。
6. 想改倍率／榮譽上限：Render → Environment 改 `PVP_MUL`、`HONOR_CAP`，重新部署即可。
7. 單一實例即可（配對與對戰狀態存在記憶體，不要開多個實例）。

## GM 帳號、貨幣上限、新手教學
- **GM 帳號**：啟動時自動建立（`GM_USER`／`GM_PASS`），帳號資料帶 `role:'gm'`，登入與 `/api/me` 回傳 `role`。GM 登入後遊戲端會補齊全角色（寶具 Lv5、之後新增的角色／造型自動補發）、素材 999、魔王道具、全造型，貨幣一次補到 999999（`GM_VER` 加 1 可重新補發）。GM 不會出現在排行榜，一般玩家也不能註冊同名帳號。
- **貨幣上限 999999**：遊戲端（`capWallet()`）與伺服器（收存檔時夾住 `wallet` 內每個欄位，負數／非數字歸 0）雙重鎖定。
- **換帳號保護**：瀏覽器裡的本機存檔記錄所屬帳號（`fgo_owner`）。換登入別的帳號（或從未登入的單機存檔註冊新帳號）時，本機存檔會先備份成 `gacha_save_v2_bak:<帳號>` 並清掉，避免 GM 的滿存檔被上傳成新帳號的存檔。
- **新手教學**：新註冊帳號第一次登入（沒有通關紀錄、只有新手角色）自動開始：主頁導覽 → 實戰教學 → 首次通關發 **魔法石 ×30**（`TUT_REWARD`）。存檔欄位 `tut`：0＝未玩、1＝已完成（已領獎）、2＝略過／舊帳號。之後可從主頁橫幅或「其他 › 新手教學」重玩（已領過不重複發獎）。
- ⚠ 抽卡目前仍是測試模式（`tpl.html` 的 `FREE=true`，召喚不扣魔法石），所以魔法石暫時沒有實際用途；要正式啟用扣款請把 `FREE` 改成 `false`。

## 連線對戰榮譽
- 每場：獲勝且擊倒對方角色才有，每擊倒 1 體 +8、每場最多 24；**認輸、斷線、結果不一致不發**（避免兩個帳號互刷）。
- **每人每日上限 500**，由伺服器統計（換日時區見 `TZ_OFFSET_HOURS`），客戶端無法繞過；達上限後仍可對戰與計積分，只是不再獲得榮譽。

## 運作方式
- **帳號**：密碼以 scrypt 加鹽雜湊；登入憑證是 30 天的簽章 token；登入嘗試每 IP 每分鐘最多 12 次。
- **雲端存檔**：玩家照常存在瀏覽器；登入後每次存檔約 3 秒後自動上傳。用版本號偵測衝突（另一台裝置較新時，會詢問要用雲端或本機，覆蓋前自動備份到 `gacha_save_v2_bak`）。
- **對戰同步（lockstep）**：伺服器發同一個亂數種子給雙方；兩個瀏覽器各自跑一模一樣的戰鬥，網路上只傳「選角」與「出招」。每次出招附帶戰況雜湊，兩端不一致就中止、不計分。出招限時，逾時由系統代選。撤退／斷線視為認輸。
- **積分**：兩端回報的結果一致才計分（Elo，K=32）；只有一端回報時 8 秒後採用單方回報；不一致則不計分。

## 目前的安全邊界（請知悉）
這是「伺服器轉送＋客戶端模擬」架構，**不是伺服器權威**：
- 伺服器會核對：登入、角色是否擁有（以雲端存檔為準）、等級上限、出招是否合法（對手端會檢查 NP／冷卻／卡種，不合法會回報並判對方違規）、兩端結果是否一致。
- 但改裝過的客戶端仍可能：竄改自己這端的畫面數值（會造成兩端雜湊不一致而被中止，不會讓對手吃虧）、在雲端存檔裡塞資源（存檔由客戶端上傳）、自行領取榮譽獎勵。
- 若之後要做排名賽獎勵等有實質價值的內容，建議下一步把戰鬥與資源結算搬到伺服器（需要把戰鬥引擎抽出成可在 Node 執行的模組）。
