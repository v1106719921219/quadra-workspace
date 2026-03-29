"""立替経費精算ハンドラ - レシート写真→MF仕訳CSV+精算書PDF(Google Drive)自動生成"""

from __future__ import annotations

import base64
import csv
import io
import json
import os
from datetime import datetime

import discord
import httpx
import pytz
from anthropic import AsyncAnthropic

from config import (
    ANTHROPIC_API_KEY,
    EXPENSE_SERVER_ID,
    GOOGLE_APPS_SCRIPT_URL,
    GOOGLE_DRIVE_EXPENSE_FOLDER_ID,
)

JST = pytz.timezone("Asia/Tokyo")

# 勘定科目 → 借方税区分マッピング
ACCOUNT_TAX_MAP = {
    "旅費交通費": "課税仕入 10%",
    "荷造運賃": "課税仕入 10%",
    "備品・消耗品費": "課税仕入 10%",
    "支払手数料": "課税仕入 10%",
    "仕入高": "課税仕入 8%",
    "会議費": "課税仕入 10%",
    "交際費": "課税仕入 10%",
    "通信費": "課税仕入 10%",
    "広告宣伝費": "課税仕入 10%",
    "水道光熱費": "課税仕入 10%",
    "地代家賃": "課税仕入 10%",
    "雑費": "課税仕入 10%",
}

ACCOUNT_LIST = list(ACCOUNT_TAX_MAP.keys())

# ✅確認待ち: プレビューメッセージID → コンテキスト
_pending: dict[int, dict] = {}

# 画像拡張子
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp")

# 立替チャンネル名から申請者名を抽出するプレフィックス
EXPENSE_CHANNEL_PREFIXES = ("立替申請-", "立替-", "現金立替-", "tatekae-", "expense-")


def detect_applicant_from_channel(channel_name: str) -> str | None:
    """チャンネル名から申請者名を自動検出。
    例: 立替申請-貞弘順子 → 貞弘順子
    """
    for prefix in EXPENSE_CHANNEL_PREFIXES:
        idx = channel_name.find(prefix)
        if idx != -1:
            return channel_name[idx + len(prefix):].strip()
    return None


async def _fetch_image_base64(url: str) -> tuple[str, str]:
    """URLから画像を取得してbase64エンコード。(data, media_type)を返す"""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return base64.standard_b64encode(resp.content).decode(), content_type


async def _extract_expenses_from_images(image_urls: list[str]) -> list[dict]:
    """Claude Vision APIでレシート画像から経費情報を一括抽出"""
    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    content: list[dict] = []
    for url in image_urls:
        b64, media_type = await _fetch_image_base64(url)
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": b64},
        })

    account_list_str = "、".join(ACCOUNT_LIST)
    content.append({
        "type": "text",
        "text": f"""添付のレシート/領収書画像から経費情報を抽出してください。
画像が複数ある場合は1枚ごとに1件として抽出してください。

各件についてJSON配列形式で返してください：
- date: 取引日 (YYYY/MM/DD形式。読み取れない場合は今日の日付)
- amount: 金額 (税込み・数値のみ。外貨の場合はその通貨のまま)
- currency: 通貨コード (JPY / USD / EUR 等。不明な場合はJPY)
- description: 摘要 (支払先・品名を簡潔に。例: 駐車場代, レターパック, ダイソー)
- account: 勘定科目 (以下から選択: {account_list_str})
- payment_method: 支払い方法 (現金/QR決済/クレジットカード等)

【科目選択のルール】
- 駐車場・電車・タクシー・バス → 旅費交通費
- 宅配便・送料・レターパック → 荷造運賃
- 文具・事務用品・消耗品・段ボール・新聞紙 → 備品・消耗品費
- 登録費・振込手数料・サービス利用料 → 支払手数料
- 食品・飲料・食料品のみ → 仕入高 (8%)
- コストコ等スーパーでの非食品は → 備品・消耗品費

JSONのみ返してください。コードブロック等は不要です。
例: [{{"date": "2026/02/07", "amount": 400, "currency": "JPY", "description": "駐車場代", "account": "旅費交通費", "payment_method": "現金"}}]""",
    })

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": content}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


def _generate_mf_journal_csv(expenses: list[dict], applicant_name: str) -> bytes:
    """マネーフォワード会計インポート用 仕訳CSV生成"""
    headers = [
        "取引No", "取引日", "借方勘定科目", "借方補助科目", "借方部門", "借方取引先",
        "借方税区分", "借方インボイス", "借方金額(円)", "借方税額",
        "貸方勘定科目", "貸方補助科目", "貸方部門", "貸方取引先",
        "貸方税区分", "貸方インボイス", "貸方金額(円)", "貸方税額",
        "摘要", "仕訳メモ", "タグ", "MF仕訳タイプ", "決算整理仕訳",
        "作成日時", "作成者", "最終更新日時", "最終更新者",
    ]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for i, exp in enumerate(expenses, 1):
        account = exp["account"]
        tax_class = ACCOUNT_TAX_MAP.get(account, "課税仕入 10%")
        amount = int(exp["amount"])
        writer.writerow([
            i, exp["date"], account, "", "", "", tax_class, "", amount, "",
            "短期借入金", f"{applicant_name}立替", "", "", "対象外", "", amount, "",
            exp["description"], "", "", "", "", "", "", "", "",
        ])
    return output.getvalue().encode("utf-8-sig")


_pdf_font_name: str | None = None  # キャッシュ


def _setup_pdf_font() -> str:
    """日本語TTFフォントを探して登録し、フォント名を返す"""
    global _pdf_font_name
    if _pdf_font_name:
        return _pdf_font_name

    import glob as _glob
    import subprocess as _sub
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont

    # TTC/TTF優先でフォントを探す（nixpkgs noto-fonts-cjk-sans の TTC は reportlab TTFont で読める）
    candidates: list[str] = []

    # fc-match でシステムフォントを探す
    try:
        r = _sub.run(
            ["fc-match", "--format=%{file}", ":lang=ja"],
            capture_output=True, text=True, timeout=5,
        )
        p = r.stdout.strip()
        if p and os.path.exists(p):
            candidates.append(p)
    except Exception:
        pass

    # nix store / 一般的なパスをglobで探す
    for pattern in [
        "/nix/store/*/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/nix/store/*/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/nix/store/*/share/fonts/opentype/noto/NotoSansCJKjp-Bold.otf",
        "/nix/store/*/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
        "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
        "/usr/share/fonts/truetype/noto/*.ttf",
    ]:
        candidates.extend(_glob.glob(pattern))

    # リポジトリ内のフォントを末尾に追加（fallback）
    repo_font = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "fonts", "NotoSansCJKjp-Bold.otf",
    )
    if os.path.exists(repo_font):
        candidates.append(repo_font)

    seen: set[str] = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        try:
            kwargs: dict = {}
            if path.lower().endswith(".ttc"):
                kwargs["subfontIndex"] = 0  # NotoSansCJK TTC: 0=SC, 1=TC, 2=JP, 3=KR
            pdfmetrics.registerFont(TTFont("ExpenseFont", path, **kwargs))
            print(f"[expense] PDF font: {path}", flush=True)
            _pdf_font_name = "ExpenseFont"
            return _pdf_font_name
        except Exception as e:
            print(f"[expense] Font load failed ({path}): {e}", flush=True)

    # 最終fallback: 組み込みCIDフォント（文字化けの可能性あり）
    print("[expense] Fallback: HeiseiKakuGo-W5", flush=True)
    pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
    _pdf_font_name = "HeiseiKakuGo-W5"
    return _pdf_font_name


def _generate_expense_pdf(
    expenses: list[dict],
    applicant_name: str,
    report_number: str,
    apply_date: str,
    image_bytes_list: list[bytes] | None = None,
) -> bytes:
    """立替経費精算書PDFを請求書形式で生成 (reportlab + システムTTFフォント)"""
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics  # noqa: F401
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors

    FONT = _setup_pdf_font()

    buf = io.BytesIO()
    page_w, page_h = A4  # points
    mx = 25 * mm  # left/right margin
    content_w = page_w - 2 * mx

    c = canvas.Canvas(buf, pagesize=A4)

    y = page_h - 20 * mm  # 現在のy座標（上から下へ）

    # ---- タイトル ----
    c.setFont(FONT, 18)
    title = "立替経費精算書"
    c.drawCentredString(page_w / 2, y - 14, title)
    y -= 30

    # ---- 右上: 精算書番号・申請日・申請者 ----
    c.setFont(FONT, 10)
    for line in [
        f"精算書番号: {report_number}",
        f"申請日:     {apply_date}",
        f"申請者:     {applicant_name}",
    ]:
        tw = c.stringWidth(line, FONT, 10)
        c.drawString(mx + content_w - tw, y, line)
        y -= 14
    y -= 8

    # ---- 明細テーブル ----
    # 列幅 (mm) : No, 取引日, 勘定科目, 支払方法, 摘要, 金額
    # 摘要列を広くするため他列を最小化
    cw_mm = [8, 18, 28, 20, 0, 26]
    remaining = (content_w / mm) - sum(cw_mm)
    cw_mm[4] = remaining  # 摘要 = 残り全幅 (約60mm)
    col_widths = [w * mm for w in cw_mm]
    headers = ["No", "取引日", "勘定科目", "支払方法", "摘要", "金額"]
    aligns = ["center", "center", "left", "center", "left", "right"]

    def fit_text(text: str, font: str, fsize: float, max_w: float) -> str:
        """テキストが max_w を超える場合は末尾を「…」で省略"""
        if c.stringWidth(text, font, fsize) <= max_w:
            return text
        ellipsis = "…"
        ew = c.stringWidth(ellipsis, font, fsize)
        while text and c.stringWidth(text, font, fsize) + ew > max_w:
            text = text[:-1]
        return text + ellipsis

    def draw_cell_text(cx, cy, cw, ch, text, font, fsize, align):
        c.setFont(font, fsize)
        pad = 1.5 * mm
        max_w = cw - pad * 2
        text = fit_text(text, font, fsize, max_w)
        tw = c.stringWidth(text, font, fsize)
        if align == "center":
            tx = cx + (cw - tw) / 2
        elif align == "right":
            tx = cx + cw - tw - pad
        else:
            tx = cx + pad
        c.drawString(tx, cy + 2 * mm, text)

    # ヘッダー行
    row_h = 8 * mm
    c.setFillColor(colors.Color(0.24, 0.24, 0.24))
    c.rect(mx, y - row_h, content_w, row_h, fill=1, stroke=0)
    c.setFillColor(colors.white)
    x = mx
    for header, cw, align in zip(headers, col_widths, aligns):
        draw_cell_text(x, y - row_h, cw, row_h, header, FONT, 9, align)
        x += cw
    y -= row_h

    # データ行
    data_row_h = 7 * mm
    total = 0
    c.setStrokeColor(colors.Color(0.78, 0.78, 0.78))
    c.setLineWidth(0.5)
    for i, exp in enumerate(expenses, 1):
        amount = int(exp["amount"])
        total += amount
        row_date = exp["date"][5:] if len(exp["date"]) == 10 else exp["date"]
        row_data = [
            str(i),
            row_date,
            exp["account"],
            exp.get("payment_method", "現金"),
            exp["description"],
            f"¥{amount:,}",
        ]
        if i % 2 == 0:
            c.setFillColor(colors.Color(0.96, 0.96, 0.96))
        else:
            c.setFillColor(colors.white)
        c.rect(mx, y - data_row_h, content_w, data_row_h, fill=1, stroke=0)
        # セル罫線
        x = mx
        for cw in col_widths:
            c.setFillColor(colors.transparent)
            c.rect(x, y - data_row_h, cw, data_row_h, fill=0, stroke=1)
            x += cw
        # テキスト
        c.setFillColor(colors.black)
        x = mx
        for val, cw, align in zip(row_data, col_widths, aligns):
            draw_cell_text(x, y - data_row_h, cw, data_row_h, val, FONT, 9, align)
            x += cw
        y -= data_row_h

    # 合計行
    total_h = 9 * mm
    c.setFillColor(colors.Color(0.86, 0.86, 0.86))
    c.setStrokeColor(colors.Color(0.6, 0.6, 0.6))
    c.setLineWidth(0.7)
    c.rect(mx, y - total_h, content_w, total_h, fill=1, stroke=1)
    c.setFillColor(colors.black)
    label_w = sum(col_widths[:-1])
    draw_cell_text(mx, y - total_h, label_w, total_h, "合　計", FONT, 10, "right")
    draw_cell_text(mx + label_w, y - total_h, col_widths[-1], total_h, f"¥{total:,}", FONT, 10, "right")
    y -= total_h + 12 * mm

    # ---- 科目別集計 ----
    c.setFont(FONT, 10)
    c.setFillColor(colors.black)
    c.drawString(mx, y, "【科目別集計】")
    y -= 14

    account_totals: dict[str, int] = {}
    for exp in expenses:
        account_totals[exp["account"]] = account_totals.get(exp["account"], 0) + int(exp["amount"])

    c.setFont(FONT, 9)
    c.setStrokeColor(colors.Color(0.78, 0.78, 0.78))
    c.setLineWidth(0.5)
    for account, amt in account_totals.items():
        c.setFillColor(colors.black)
        c.drawString(mx, y, account)
        amt_str = f"¥{amt:,}"
        aw = c.stringWidth(amt_str, FONT, 9)
        c.drawString(mx + 65 * mm - aw, y, amt_str)
        c.line(mx, y - 2, mx + 70 * mm, y - 2)
        y -= 11

    # ---- 添付レシート（1枚1ページ）----
    if image_bytes_list:
        from reportlab.lib.utils import ImageReader
        from PIL import Image as PILImage

        for i, img_bytes in enumerate(image_bytes_list, 1):
            c.showPage()
            c.setFont(FONT, 12)
            c.setFillColor(colors.black)
            label = f"【添付レシート {i} / {len(image_bytes_list)}】"
            c.drawString(mx, page_h - 20 * mm, label)

            try:
                pil_img = PILImage.open(io.BytesIO(img_bytes))
                # EXIF回転補正
                try:
                    from PIL import ImageOps
                    pil_img = ImageOps.exif_transpose(pil_img)
                except Exception:
                    pass
                if pil_img.mode not in ("RGB", "RGBA"):
                    pil_img = pil_img.convert("RGB")
                iw, ih = pil_img.size

                max_w = content_w
                max_h = page_h - 35 * mm  # タイトル分を除く
                scale = min(max_w / iw, max_h / ih)
                draw_w = iw * scale
                draw_h = ih * scale

                img_x = mx + (content_w - draw_w) / 2
                img_y = page_h - 30 * mm - draw_h

                # PILイメージをバイト列に戻してImageReader経由で埋め込み
                rgb_buf = io.BytesIO()
                pil_img.save(rgb_buf, format="JPEG", quality=85)
                rgb_buf.seek(0)
                c.drawImage(ImageReader(rgb_buf), img_x, img_y, width=draw_w, height=draw_h)
            except Exception as e:
                print(f"[expense] レシート画像埋め込みエラー ({i}): {e}", flush=True)
                c.setFont(FONT, 9)
                c.setFillColor(colors.red)
                c.drawString(mx, page_h - 40 * mm, f"[画像の読み込みに失敗しました: {e}]")

    c.save()
    return buf.getvalue()


async def _download_images(image_urls: list[str]) -> list[bytes]:
    """Discord添付画像をバイト列でダウンロード（PDF埋め込み用）"""
    result: list[bytes] = []
    async with httpx.AsyncClient(timeout=30) as client:
        for url in image_urls:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                result.append(resp.content)
            except Exception as e:
                print(f"[expense] 画像ダウンロード失敗: {e}", flush=True)
    return result


async def _get_fx_rate(from_currency: str, to_currency: str = "JPY") -> float:
    """Frankfurter API で為替レートを取得。失敗時はフォールバック値を返す"""
    FALLBACKS = {"USD": 150.0, "EUR": 165.0, "GBP": 190.0, "CNY": 21.0}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.frankfurter.app/latest?from={from_currency}&to={to_currency}"
            )
            resp.raise_for_status()
            rate = resp.json()["rates"][to_currency]
            return float(rate)
    except Exception as e:
        print(f"[expense] 為替レート取得失敗 ({from_currency}/{to_currency}): {e}", flush=True)
        return FALLBACKS.get(from_currency.upper(), 1.0)


async def _convert_expenses_to_jpy(expenses: list[dict]) -> tuple[list[dict], dict[str, float]]:
    """外貨建て経費をJPYに換算。適用レート辞書も返す"""
    foreign_currencies = {
        e.get("currency", "JPY").upper()
        for e in expenses
        if e.get("currency", "JPY").upper() != "JPY"
    }

    rates: dict[str, float] = {}
    for cur in foreign_currencies:
        rates[cur] = await _get_fx_rate(cur)

    for exp in expenses:
        cur = exp.get("currency", "JPY").upper()
        if cur == "JPY":
            continue
        orig_amount = float(exp["amount"])
        rate = rates[cur]
        jpy_amount = round(orig_amount * rate)
        # 摘要に元の外貨金額を付記
        exp["description"] = f"{exp['description']} ({cur} {orig_amount:,.2f})"
        exp["amount"] = jpy_amount
        exp["currency"] = "JPY"

    return expenses, rates


async def _upload_pdf_to_drive(pdf_bytes: bytes, file_name: str) -> str | None:
    """GAS経由でPDFをGoogle Driveにアップロード。Drive URLを返す（失敗時はNone）"""
    if not GOOGLE_APPS_SCRIPT_URL or not GOOGLE_DRIVE_EXPENSE_FOLDER_ID:
        return None
    try:
        pdf_b64 = base64.standard_b64encode(pdf_bytes).decode()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                GOOGLE_APPS_SCRIPT_URL,
                json={
                    "action": "save_pdf",
                    "folderId": GOOGLE_DRIVE_EXPENSE_FOLDER_ID,
                    "fileName": file_name,
                    "pdfBase64": pdf_b64,
                },
            )
            resp.raise_for_status()
            result = resp.json()
            if result.get("success"):
                return result["fileUrl"]
            print(f"[expense] Drive保存失敗: {result.get('error')}", flush=True)
    except Exception as e:
        print(f"[expense] Drive upload error: {e}", flush=True)
    return None


def _build_preview_embed(
    expenses: list[dict],
    applicant_name: str,
    report_number: str,
    image_count: int,
    fx_rates: dict[str, float] | None = None,
) -> discord.Embed:
    embed = discord.Embed(
        title=f"💰 立替経費精算書 | {applicant_name} | {report_number}",
        description=f"レシート{image_count}枚をAIで解析しました。内容を確認して ✅ を押してください。",
        color=0x2ECC71,
    )
    lines = []
    total = 0
    for i, exp in enumerate(expenses, 1):
        amount = int(exp["amount"])
        lines.append(
            f"`{i}` {exp['date']}　**{exp['account']}**　¥{amount:,}　{exp['description']}"
        )
        total += amount
    embed.add_field(name="明細", value="\n".join(lines) or "なし", inline=False)
    embed.add_field(name="合計", value=f"**¥{total:,}**", inline=True)
    embed.add_field(name="件数", value=f"{len(expenses)}件", inline=True)
    if fx_rates:
        rate_str = "　".join(f"{cur}/JPY = {rate:,.2f}" for cur, rate in fx_rates.items())
        embed.add_field(name="適用為替レート", value=rate_str, inline=False)
    embed.set_footer(text="✅ で確定 → PDF + MF仕訳CSV を出力します")
    return embed


async def process_expense_request(
    bot,
    interaction: discord.Interaction,
    applicant_name: str | None,
    report_number: str,
) -> None:
    """立替申請スラッシュコマンドのメイン処理"""
    await interaction.response.defer(thinking=True)

    if interaction.guild_id != EXPENSE_SERVER_ID:
        await interaction.followup.send("❌ このコマンドは指定サーバーでのみ使用できます。", ephemeral=True)
        return

    channel = interaction.channel

    if not applicant_name:
        applicant_name = detect_applicant_from_channel(channel.name)
    if not applicant_name:
        await interaction.followup.send(
            "❌ 申請者名を指定するか、チャンネル名を `立替申請-氏名` の形式にしてください。\n"
            "例: `#立替申請-貞弘順子`"
        )
        return

    # 前回の精算確定メッセージ（Botの✅投稿）以降に投稿された画像のみ対象
    image_urls: list[str] = []
    async for msg in channel.history(limit=200):
        # Botが投稿した精算確定メッセージに到達したら終了
        if (
            msg.author.id == bot.user.id
            and msg.content.startswith("✅ **立替経費精算書を作成しました**")
        ):
            break
        for att in msg.attachments:
            if att.filename.lower().endswith(IMAGE_EXTENSIONS):
                image_urls.append(att.url)
        if len(image_urls) >= 20:
            break

    # history()は新しい順なので時系列順に戻す
    image_urls.reverse()

    if not image_urls:
        await interaction.followup.send(
            "❌ このチャンネルにレシート画像が見つかりません。\n"
            "先にレシートの写真をアップロードしてから `/立替申請` を実行してください。"
        )
        return

    await interaction.followup.send(
        f"📸 {len(image_urls)}枚のレシートを検出しました。AI解析中... しばらくお待ちください。"
    )

    try:
        expenses = await _extract_expenses_from_images(image_urls)
    except Exception as e:
        await channel.send(f"❌ AI解析に失敗しました: {e}")
        print(f"[expense] AI解析エラー: {e}", flush=True)
        return

    if not expenses:
        await channel.send("❌ レシートから経費情報を読み取れませんでした。")
        return

    # 外貨があれば円換算
    expenses, fx_rates = await _convert_expenses_to_jpy(expenses)

    apply_date = datetime.now(JST).strftime("%Y/%m/%d")
    embed = _build_preview_embed(expenses, applicant_name, report_number, len(image_urls), fx_rates)
    view = ExpensePreviewView()
    preview_msg = await channel.send(embed=embed, view=view)

    _pending[preview_msg.id] = {
        "expenses": expenses,
        "applicant_name": applicant_name,
        "report_number": report_number,
        "apply_date": apply_date,
        "channel_id": channel.id,
        "image_urls": image_urls,
        "fx_rates": fx_rates,
    }


async def _finalize_expense(bot, context: dict, channel: discord.TextChannel) -> None:
    """精算を確定してPDF・CSV生成・チャンネルに送信（ボタンと✅リアクションで共用）"""
    expenses = context["expenses"]
    applicant_name = context["applicant_name"]
    report_number = context["report_number"]
    apply_date = context["apply_date"]

    safe_number = report_number.replace("/", "-").replace(".", "_")
    pdf_filename = f"立替経費精算書_{safe_number}_{applicant_name}.pdf"
    csv_filename = f"MF仕訳_{safe_number}_{applicant_name}.csv"
    total = sum(int(e["amount"]) for e in expenses)

    try:
        mf_csv = _generate_mf_journal_csv(expenses, applicant_name)
        mf_file = discord.File(io.BytesIO(mf_csv), filename=csv_filename)

        drive_url = None
        pdf_discord_file = None
        try:
            image_bytes_list = await _download_images(context.get("image_urls", []))
            pdf_bytes = _generate_expense_pdf(expenses, applicant_name, report_number, apply_date, image_bytes_list)
            drive_url = await _upload_pdf_to_drive(pdf_bytes, pdf_filename)
            if not drive_url:
                pdf_discord_file = discord.File(io.BytesIO(pdf_bytes), filename=pdf_filename)
        except Exception as e:
            print(f"[expense] PDF生成エラー: {e}", flush=True)

        lines = [
            "✅ **立替経費精算書を作成しました**",
            f"申請者: **{applicant_name}** | {report_number} | 合計: **¥{total:,}**",
            "",
        ]
        if drive_url:
            lines.append(f"📄 精算書PDF（Google Drive）: {drive_url}")
        lines.append("📊 MF仕訳CSVをマネーフォワード会計にインポートしてください")

        files = [mf_file]
        if pdf_discord_file:
            files.append(pdf_discord_file)
            lines.append("📋 精算書PDF（添付ファイル）")

        await channel.send("\n".join(lines), files=files)

    except Exception as e:
        await channel.send(f"❌ ファイル生成に失敗しました: {e}")
        print(f"[expense] ファイル生成エラー: {e}", flush=True)


# ---- Discord UI: 修正モーダル / 確定ボタン ----

class ExpenseEditModal(discord.ui.Modal, title="経費明細の修正"):
    row_number = discord.ui.TextInput(
        label="行番号",
        placeholder="例: 1",
        required=True,
        max_length=3,
        style=discord.TextStyle.short,
    )
    account = discord.ui.TextInput(
        label="勘定科目（空欄は変更なし）",
        placeholder="旅費交通費 / 荷造運賃 / 備品・消耗品費 / 支払手数料 / 仕入高 / 雑費",
        required=False,
        max_length=20,
        style=discord.TextStyle.short,
    )
    amount = discord.ui.TextInput(
        label="金額・円（空欄は変更なし）",
        placeholder="数値のみ。例: 1500",
        required=False,
        max_length=10,
        style=discord.TextStyle.short,
    )
    description = discord.ui.TextInput(
        label="摘要（空欄は変更なし）",
        required=False,
        max_length=100,
        style=discord.TextStyle.short,
    )
    date = discord.ui.TextInput(
        label="取引日（空欄は変更なし）",
        placeholder="YYYY/MM/DD",
        required=False,
        max_length=10,
        style=discord.TextStyle.short,
    )

    def __init__(self, message_id: int, channel_id: int):
        super().__init__()
        self.message_id = message_id
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        context = _pending.get(self.message_id)
        if not context:
            await interaction.response.send_message(
                "❌ セッションが見つかりません。再度 `/立替申請` を実行してください。", ephemeral=True
            )
            return

        try:
            row_idx = int(self.row_number.value.strip()) - 1
        except ValueError:
            await interaction.response.send_message("❌ 行番号は数字で入力してください。", ephemeral=True)
            return

        expenses = context["expenses"]
        if row_idx < 0 or row_idx >= len(expenses):
            await interaction.response.send_message(
                f"❌ 行番号は 1〜{len(expenses)} の範囲で指定してください。", ephemeral=True
            )
            return

        exp = expenses[row_idx]
        changed: list[str] = []

        if self.account.value.strip():
            exp["account"] = self.account.value.strip()
            changed.append(f"勘定科目→{exp['account']}")

        if self.amount.value.strip():
            try:
                exp["amount"] = int(
                    self.amount.value.strip().replace(",", "").replace("¥", "").replace("￥", "")
                )
                changed.append(f"金額→¥{exp['amount']:,}")
            except ValueError:
                await interaction.response.send_message("❌ 金額は数値で入力してください。", ephemeral=True)
                return

        if self.description.value.strip():
            exp["description"] = self.description.value.strip()
            changed.append(f"摘要→{exp['description']}")

        if self.date.value.strip():
            exp["date"] = self.date.value.strip()
            changed.append(f"取引日→{exp['date']}")

        if not changed:
            await interaction.response.send_message("変更がありませんでした。", ephemeral=True)
            return

        # プレビューEmbedを更新
        new_embed = _build_preview_embed(
            expenses,
            context["applicant_name"],
            context["report_number"],
            len(context.get("image_urls", [])),
            context.get("fx_rates"),
        )
        try:
            ch = interaction.client.get_channel(self.channel_id)
            msg = await ch.fetch_message(self.message_id)
            await msg.edit(embed=new_embed)
        except Exception as e:
            print(f"[expense] プレビュー更新エラー: {e}", flush=True)

        await interaction.response.send_message(
            f"✏️ {row_idx + 1}行目を修正しました: {', '.join(changed)}",
            ephemeral=True,
        )


class ExpensePreviewView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=3600)  # 1時間

    @discord.ui.button(label="✅ 確定", style=discord.ButtonStyle.success)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        context = _pending.pop(interaction.message.id, None)
        if not context:
            await interaction.response.send_message("❌ すでに確定済みか、セッションが切れています。", ephemeral=True)
            return
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(view=self)
        channel = interaction.client.get_channel(context["channel_id"])
        await _finalize_expense(interaction.client, context, channel)

    @discord.ui.button(label="✏️ 修正", style=discord.ButtonStyle.secondary)
    async def edit(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.message.id not in _pending:
            await interaction.response.send_message("❌ セッションが切れています。", ephemeral=True)
            return
        modal = ExpenseEditModal(interaction.message.id, interaction.channel_id)
        await interaction.response.send_modal(modal)

    async def on_timeout(self):
        _pending.pop(id(self), None)  # 念のためクリーンアップ（実際はmessage_idで管理）


async def handle_expense_reaction(bot, payload: discord.RawReactionActionEvent) -> None:
    """✅リアクションでの確定（ボタン未対応環境向けfallback）"""
    context = _pending.pop(payload.message_id, None)
    if not context:
        return
    channel = bot.get_channel(context["channel_id"])
    if not channel:
        return
    await _finalize_expense(bot, context, channel)
