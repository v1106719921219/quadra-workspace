# 価格表を自分のサーバーに自動転送するBotの作り方

クアドラの #pricelist-english に届く英語版価格表を、自分の別のDiscordサーバーに自動転送するBotの作成手順です。

---

## 仕組み

```
クアドラ x 〇〇 サーバー
  #pricelist-english ← 英語版価格表が届く
       ↓ Botが自動検知
自分のサーバー
  #price-list（任意のチャンネル） ← 自動転送
```

---

## 手順

### ステップ1: Discord Botを作成する

1. https://discord.com/developers/applications にアクセス
2. 右上の **「New Application」** をクリック
3. 名前を入力（例: `PriceList Forwarder`）→ **Create**
4. 左メニューの **「Bot」** をクリック
5. **「Reset Token」** をクリックしてトークンをコピー（⚠️ 他人に見せないでください）
6. 下にスクロールして **「MESSAGE CONTENT INTENT」** をONにする → **Save**

### ステップ2: Botをサーバーに招待する

1. 左メニューの **「OAuth2」** をクリック
2. **「URL Generator」** をクリック
3. SCOPESで **「bot」** にチェック
4. BOT PERMISSIONSで以下にチェック:
   - `Read Messages/View Channels`
   - `Send Messages`
5. 生成されたURLをコピーしてブラウザで開く
6. **クアドラのサーバー** と **自分のサーバー** の両方に招待する

### ステップ3: チャンネルIDを取得する

1. Discordの設定 → 詳細設定 → **「開発者モード」** をONにする
2. クアドラのサーバーの **#pricelist-english** を右クリック → **「チャンネルIDをコピー」**（= 転送元ID）
3. 自分のサーバーの転送先チャンネルを右クリック → **「チャンネルIDをコピー」**（= 転送先ID）

### ステップ4: Botのコードを作成する

パソコンに以下のファイルを作成してください。

#### 1. `bot.py`（メインファイル）

```python
import discord

# ===== ここを自分の設定に変更 =====
BOT_TOKEN = "ここにステップ1でコピーしたトークンを貼り付け"
SOURCE_CHANNEL_ID = 123456789  # クアドラの #pricelist-english のチャンネルID
TARGET_CHANNEL_ID = 987654321  # 自分のサーバーの転送先チャンネルID
# ==================================

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)


@client.event
async def on_ready():
    print(f"Bot起動完了: {client.user}")


@client.event
async def on_message(message):
    # Bot自身のメッセージは無視
    if message.author.bot is False:
        return

    # 転送元チャンネル以外は無視
    if message.channel.id != SOURCE_CHANNEL_ID:
        return

    # 転送先チャンネルを取得
    target = client.get_channel(TARGET_CHANNEL_ID)
    if not target:
        print("転送先チャンネルが見つかりません")
        return

    # メッセージを転送
    if message.content:
        await target.send(message.content)

    # 添付ファイルがあれば転送
    for attachment in message.attachments:
        await target.send(attachment.url)

    print(f"価格表を転送しました")


client.run(BOT_TOKEN)
```

#### 2. Pythonのインストール（まだの場合）

- https://www.python.org/downloads/ からPythonをダウンロード・インストール

#### 3. discord.pyのインストール

ターミナル（コマンドプロンプト）で以下を実行：

```
pip install discord.py
```

### ステップ5: Botを起動する

ターミナルで以下を実行：

```
python bot.py
```

`Bot起動完了` と表示されれば成功です。

---

## 複数のチャンネルに転送したい場合

転送先を複数にしたい場合は、`bot.py` を以下のように変更してください：

```python
import discord

BOT_TOKEN = "ここにトークン"
SOURCE_CHANNEL_ID = 123456789  # クアドラの #pricelist-english

# 転送先チャンネルIDのリスト（複数追加可能）
TARGET_CHANNEL_IDS = [
    987654321,  # サーバーAの転送先
    111222333,  # サーバーBの転送先
]

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)


@client.event
async def on_ready():
    print(f"Bot起動完了: {client.user}")


@client.event
async def on_message(message):
    if message.author.bot is False:
        return
    if message.channel.id != SOURCE_CHANNEL_ID:
        return

    for target_id in TARGET_CHANNEL_IDS:
        target = client.get_channel(target_id)
        if not target:
            continue
        if message.content:
            await target.send(message.content)
        for attachment in message.attachments:
            await target.send(attachment.url)

    print(f"価格表を{len(TARGET_CHANNEL_IDS)}件のチャンネルに転送しました")


client.run(BOT_TOKEN)
```

---

## 24時間動かしたい場合

パソコンを閉じてもBotを動かし続けたい場合は、以下のサービスが無料で使えます：

- **Railway**（https://railway.app）— 無料枠あり
- **Render**（https://render.com）— 無料プランあり

上記サービスにbot.pyをアップロードして起動設定するだけで、24時間稼働できます。

---

## よくある質問

**Q: Botが動かない**
→ トークン、チャンネルID、discord.pyのインストールを再確認してください

**Q: メッセージが転送されない**
→ Botが両方のサーバーに参加しているか確認してください。また「MESSAGE CONTENT INTENT」がONになっているか確認してください

**Q: 転送先のチャンネル名は何でもいい？**
→ はい、任意のチャンネルでOKです
