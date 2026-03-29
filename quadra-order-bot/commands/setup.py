"""機能1: /セットアップ スラッシュコマンド（顧客サーバーで実行）"""

import asyncio
import discord
from discord import app_commands
from discord.ext import commands

import httpx
from config import MANAGEMENT_SERVER_ID, SHIPORD_API_URL, SHIPORD_BASE_URL, DISCORD_BOT_API_KEY, AUTO_INVITE_USER_IDS
from db.supabase import upsert_server_customer, get_all_customers, get_customer_by_server_id, update_customer_pricelist_webhook, update_customer_english_pricelist, get_customer_pricelist_status, update_customer_markup
from utils.icon import generate_server_icon


class PricelistButton(discord.ui.View):
    """お客さんが押すと価格表の自動更新をON/OFFできるトグルボタン"""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="価格表を受け取る",
        style=discord.ButtonStyle.primary,
        custom_id="pricelist_optin",
    )
    async def optin(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)

        guild = interaction.guild
        if not guild:
            await interaction.followup.send("エラーが発生しました。", ephemeral=True)
            return

        mapping = get_customer_by_server_id(str(guild.id))
        if not mapping:
            await interaction.followup.send("このサーバーは未登録です。", ephemeral=True)
            return

        customer_id = mapping["customer_id"]
        pricelist_channel_id = mapping.get("pricelist_channel_id")

        if not pricelist_channel_id:
            await interaction.followup.send("プライスリストチャンネルが見つかりません。", ephemeral=True)
            return

        # 現在の状態を確認
        status = get_customer_pricelist_status(customer_id)
        is_enabled = bool(status.get("pricelist_webhook_url"))

        if is_enabled:
            # OFF にする
            update_customer_pricelist_webhook(customer_id, None)
            button.label = "価格表を受け取る"
            button.style = discord.ButtonStyle.primary
            await interaction.message.edit(view=self)
            await interaction.followup.send(
                "価格表の自動配信をオフにしました。\n再度ボタンを押すとオンに戻せます。",
                ephemeral=True,
            )
        else:
            # ON にする
            try:
                pricelist_ch = await guild.fetch_channel(int(pricelist_channel_id))
            except Exception:
                await interaction.followup.send("チャンネルの取得に失敗しました。", ephemeral=True)
                return

            pricelist_webhook = await pricelist_ch.create_webhook(name="クアドラバックオフィス")
            update_customer_pricelist_webhook(customer_id, pricelist_webhook.url)

            button.label = "価格表の自動更新ON ✅"
            button.style = discord.ButtonStyle.success
            await interaction.message.edit(view=self)
            await interaction.followup.send(
                "価格表の自動更新を有効にしました！\n更新があればこのチャンネルに届きます。\nオフにしたい場合はもう一度ボタンを押してください。",
                ephemeral=True,
            )


class MarkupModal(discord.ui.Modal, title="上乗せ金額の設定"):
    """上乗せ金額を入力するモーダル"""

    amount = discord.ui.TextInput(
        label="上乗せ金額（円）",
        placeholder="例: 50（¥50上乗せ）、0で上乗せなし",
        required=True,
        max_length=10,
    )

    def __init__(self, customer_id: str):
        super().__init__()
        self.customer_id = customer_id

    async def on_submit(self, interaction: discord.Interaction):
        try:
            value = int(self.amount.value.strip().replace(",", "").replace("¥", ""))
        except ValueError:
            await interaction.response.send_message(
                "数字を入力してください（例: 50）", ephemeral=True
            )
            return

        if value < 0:
            await interaction.response.send_message(
                "0以上の数字を入力してください。", ephemeral=True
            )
            return

        update_customer_markup(self.customer_id, value)

        if value > 0:
            await interaction.response.send_message(
                f"上乗せ金額を +¥{value:,} に設定しました。\n次回の価格表配信から反映されます。",
                ephemeral=True,
            )
        else:
            await interaction.response.send_message(
                "上乗せ金額をなしに設定しました。",
                ephemeral=True,
            )


class EnglishPricelistButton(discord.ui.View):
    """英語版価格表の自動配信をON/OFFできるトグルボタン + 上乗せ金額設定ボタン"""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label="英語版価格表を受け取る",
        style=discord.ButtonStyle.primary,
        custom_id="english_pricelist_optin",
    )
    async def optin(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)

        guild = interaction.guild
        if not guild:
            await interaction.followup.send("エラーが発生しました。", ephemeral=True)
            return

        mapping = get_customer_by_server_id(str(guild.id))
        if not mapping:
            await interaction.followup.send("このサーバーは未登録です。", ephemeral=True)
            return

        customer_id = mapping["customer_id"]

        # 現在の状態を確認
        status = get_customer_pricelist_status(customer_id)
        is_enabled = bool(status.get("english_pricelist_webhook_url"))

        if is_enabled:
            # OFF にする
            update_customer_english_pricelist(customer_id, None)
            button.label = "英語版価格表を受け取る"
            button.style = discord.ButtonStyle.primary
            await interaction.message.edit(view=self)
            await interaction.followup.send(
                "英語版価格表の自動配信をオフにしました。\n再度ボタンを押すとオンに戻せます。",
                ephemeral=True,
            )
        else:
            # ON にする
            try:
                en_ch = discord.utils.get(guild.text_channels, name="💎【自動応答】pricelist-english") or discord.utils.get(guild.text_channels, name="pricelist-english")
                if not en_ch:
                    en_ch = await guild.create_text_channel("💎【自動応答】pricelist-english")
                webhook = await en_ch.create_webhook(name="クアドラバックオフィス")
            except Exception as e:
                await interaction.followup.send(f"Webhook作成に失敗しました: {e}", ephemeral=True)
                return

            update_customer_english_pricelist(customer_id, webhook.url)

            button.label = "英語版価格表ON ✅"
            button.style = discord.ButtonStyle.success
            await interaction.message.edit(view=self)
            await interaction.followup.send(
                "英語版価格表の自動配信を有効にしました！\nオフにしたい場合はもう一度ボタンを押してください。",
                ephemeral=True,
            )

    @discord.ui.button(
        label="上乗せ金額を設定",
        style=discord.ButtonStyle.secondary,
        custom_id="english_pricelist_markup",
    )
    async def set_markup(self, interaction: discord.Interaction, button: discord.ui.Button):
        guild = interaction.guild
        if not guild:
            await interaction.response.send_message("エラーが発生しました。", ephemeral=True)
            return

        mapping = get_customer_by_server_id(str(guild.id))
        if not mapping:
            await interaction.response.send_message("このサーバーは未登録です。", ephemeral=True)
            return

        customer_id = mapping["customer_id"]

        # 現在の設定を確認
        status = get_customer_pricelist_status(customer_id)
        if not status.get("english_pricelist_webhook_url"):
            await interaction.response.send_message(
                "先に「英語版価格表を受け取る」ボタンを押して配信を有効にしてください。",
                ephemeral=True,
            )
            return

        modal = MarkupModal(customer_id)
        current = status.get("price_markup", 0) or 0
        if current > 0:
            modal.amount.default = str(current)
        await interaction.response.send_modal(modal)


class SetupCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        # Bot再起動後もボタンが動くように永続Viewを登録
        self.bot.add_view(PricelistButton())
        self.bot.add_view(EnglishPricelistButton())

    @app_commands.command(
        name="セットアップ",
        description="このサーバーを顧客サーバーとしてセットアップします",
    )
    @app_commands.describe(顧客名="shipordに登録済みの顧客名")
    async def setup_customer(
        self,
        interaction: discord.Interaction,
        顧客名: str,
    ):
        # 管理サーバーでは実行不可
        if interaction.guild_id == MANAGEMENT_SERVER_ID:
            await interaction.response.send_message(
                "❌ このコマンドは顧客サーバーで実行してください。", ephemeral=True
            )
            return

        await interaction.response.defer(thinking=True)

        try:
            guild = interaction.guild
            if not guild:
                await interaction.followup.send("❌ サーバー情報を取得できません。")
                return

            # 顧客一覧から名前で検索（同期DBコールをスレッドで実行）
            customers = await asyncio.to_thread(get_all_customers)
            customer = next(
                (c for c in customers if c["name"] == 顧客名 or c.get("company_name") == 顧客名),
                None,
            )

            if not customer:
                customer_names = ", ".join(c["name"] for c in customers[:20])
                await interaction.followup.send(
                    f"❌ 顧客「{顧客名}」がshipordに見つかりません。\n"
                    f"登録済み顧客: {customer_names}"
                )
                return

            customer_id = customer["id"]
            customer_display = customer.get("company_name") or customer["name"]

            # Step 1: アイコン生成 & サーバー名変更
            server_name = f"クアドラ x {customer_display}"
            icon_bytes = generate_server_icon(customer_display)
            await guild.edit(name=server_name, icon=icon_bytes)

            # Step 2: 既存チャンネルを削除
            for ch in guild.channels:
                try:
                    await ch.delete()
                except Exception:
                    pass

            # Step 3: チャンネル作成（4チャンネル）
            general_ch = await guild.create_text_channel("🛒 ご注文はこちら", topic="注文はこちらのチャンネルで")
            invoice_ch = await guild.create_text_channel(
                "💳 請求書・配送ラベル",
                topic="お支払いが完了しましたら支払完了のスタンプを押していただけますようお願いします。スクショ等は不要です。スタンプで結構です。",
            )
            label_url = f"{SHIPORD_BASE_URL}/shipping/customer/{customer_id}"
            label_ch = await guild.create_text_channel(
                "✈️ 海外代行ラベル",
                topic=label_url,
            )
            pricelist_ch = await guild.create_text_channel("💎【自動応答】プライスリスト")

            # Step 3.5: 初期メッセージ投稿
            invoice_msg = await invoice_ch.send(
                "📋 **請求書・配送ラベル**\n\n"
                "こちらのチャンネルに請求書・配送ラベルが届きます。\n\n"
                "お支払いが完了しましたら、該当メッセージに ✅ のスタンプを押していただけますようお願いします。\n"
                "**スクショ等は不要です。スタンプで結構です。**"
            )
            await invoice_msg.add_reaction("✅")
            await invoice_msg.pin()

            label_msg = await label_ch.send(
                "📦 **海外代行ラベル**\n\n"
                "海外代行のラベルアップロードはこちらからお願いします。\n"
                f"👉 {label_url}\n\n"
                "上記URLを開いて、ラベル画像を撮影・選択するだけでアップロードできます。"
            )
            await label_msg.pin()

            # Step 3.7: スタッフ用管理者ロールを作成
            staff_role = None
            try:
                staff_role = await guild.create_role(
                    name="スタッフ",
                    permissions=discord.Permissions(administrator=True),
                    colour=discord.Colour.blue(),
                    reason="セットアップ: スタッフ管理者ロール",
                )
            except Exception as e:
                print(f"⚠️ スタッフロール作成失敗: {e}", flush=True)

            # Step 4: Webhook作成
            general_webhook = await general_ch.create_webhook(name="クアドラバックオフィス")
            invoice_webhook = await invoice_ch.create_webhook(name="クアドラバックオフィス")

            # Step 5: shipord顧客レコードにWebhook URL登録
            async with httpx.AsyncClient() as client:
                await client.patch(
                    f"{SHIPORD_API_URL}/api/customers/{customer_id}",
                    json={
                        "discord_webhook_url": invoice_webhook.url,
                        "invoice_webhook_url": invoice_webhook.url,
                    },
                    headers={"Authorization": f"Bearer {DISCORD_BOT_API_KEY}"},
                    timeout=10,
                )

            # Step 6: サーバー↔顧客マッピング登録（同期DBコールをスレッドで実行）
            await asyncio.to_thread(
                upsert_server_customer,
                str(guild.id),
                server_name,
                customer_id,
                str(general_ch.id),
                str(invoice_ch.id),
                str(label_ch.id),
                str(pricelist_ch.id),
            )

            # Step 7: 招待リンク作成 & 完了通知
            invite = await general_ch.create_invite(max_age=0, max_uses=0)

            await general_ch.send(
                f"✅ セットアップ完了！\n"
                f"顧客：{customer_display}\n"
                f"サーバー名：{server_name}\n"
                f"招待リンク：{invite.url}\n"
                f"← このリンクをお客さんに送るだけ"
            )

            # 既にサーバーにいるスタッフにロール付与
            if staff_role:
                for uid in AUTO_INVITE_USER_IDS:
                    try:
                        member = await guild.fetch_member(uid)
                        await member.add_roles(staff_role, reason="セットアップ: スタッフロール付与")
                    except Exception:
                        pass

            # スタッフに招待リンクをDM送信
            invited = 0
            for uid in AUTO_INVITE_USER_IDS:
                try:
                    user = await self.bot.fetch_user(uid)
                    await user.send(
                        f"📩 新しい顧客サーバーが作成されました\n"
                        f"顧客：{customer_display}\n"
                        f"招待リンク：{invite.url}"
                    )
                    invited += 1
                except Exception:
                    pass
            if invited > 0:
                await general_ch.send(f"📩 {invited}名のスタッフに招待リンクをDM送信しました")

            # #プライスリストにオプトインボタンを投稿
            await pricelist_ch.send(
                "**価格表の自動配信**\n"
                "下のボタンを押すと、価格表の更新があった際に\n"
                "このチャンネルに自動で届くようになります。",
                view=PricelistButton(),
            )

            # #pricelist-english チャンネル作成 + ボタン投稿
            en_pricelist_ch = await guild.create_text_channel("💎【自動応答】pricelist-english")
            await en_pricelist_ch.send(
                "**英語版価格表の自動配信**\n"
                "英語版の価格表が欲しい方は「英語版価格表を受け取る」ボタンを押してください。\n"
                "上乗せ金額を設定したい場合は「上乗せ金額を設定」ボタンを押してください。\n"
                "オフにしたい場合はもう一度「英語版価格表を受け取る」ボタンを押してください。\n\n"
                "自社のお客様のご提案にご利用ください。",
                view=EnglishPricelistButton(),
            )

        except Exception as e:
            try:
                await interaction.followup.send(f"❌ セットアップに失敗しました: {e}")
            except Exception:
                pass


    @app_commands.command(
        name="チャンネル名更新",
        description="チャンネル名を新しいデザインに一括更新します",
    )
    async def rename_channels(self, interaction: discord.Interaction):
        if interaction.guild_id == MANAGEMENT_SERVER_ID:
            await interaction.response.send_message("❌ 顧客サーバーで実行してください。", ephemeral=True)
            return

        await interaction.response.defer(thinking=True)

        guild = interaction.guild
        if not guild:
            await interaction.followup.send("❌ サーバー情報を取得できません。")
            return

        RENAME_MAP = {
            "注文はこちらで": "🛒 ご注文はこちら",
            "請求書＆配送ラベル": "💳 請求書・配送ラベル",
            "海外代行ラベル": "✈️ 海外代行ラベル",
            "プライスリスト": "💎【自動応答】プライスリスト",
            "pricelist-english": "💎【自動応答】pricelist-english",
        }

        renamed = []
        for ch in guild.text_channels:
            new_name = RENAME_MAP.get(ch.name)
            if new_name:
                try:
                    await ch.edit(name=new_name)
                    renamed.append(f"✅ {ch.name} → {new_name}")
                except Exception as e:
                    renamed.append(f"⚠️ {ch.name} の更新失敗: {e}")

        if renamed:
            await interaction.followup.send("チャンネル名を更新しました:\n" + "\n".join(renamed))
        else:
            await interaction.followup.send("更新対象のチャンネルが見つかりませんでした。")

    @app_commands.command(
        name="アイコン更新",
        description="サーバーアイコンを再生成します（チャンネルはそのまま）",
    )
    async def update_icon(self, interaction: discord.Interaction):
        if interaction.guild_id == MANAGEMENT_SERVER_ID:
            await interaction.response.send_message("❌ 顧客サーバーで実行してください。", ephemeral=True)
            return

        await interaction.response.defer(thinking=True)

        guild = interaction.guild
        if not guild:
            await interaction.followup.send("❌ サーバー情報を取得できません。")
            return

        mapping = get_customer_by_server_id(str(guild.id))
        if not mapping:
            await interaction.followup.send("❌ このサーバーは未登録です。先に /セットアップ を実行してください。")
            return

        customer = mapping.get("customers", {})
        customer_display = customer.get("company_name") or customer.get("name", "不明")

        try:
            server_name = f"クアドラ x {customer_display}"
            icon_bytes = generate_server_icon(customer_display)
            await guild.edit(name=server_name, icon=icon_bytes)
            await interaction.followup.send(f"✅ アイコンを更新しました")
        except Exception as e:
            await interaction.followup.send(f"❌ アイコン更新に失敗しました: {e}")

    @app_commands.command(
        name="プライスリスト追加",
        description="プライスリストチャンネルを追加します（既存チャンネルはそのまま）",
    )
    async def add_pricelist(self, interaction: discord.Interaction):
        if interaction.guild_id == MANAGEMENT_SERVER_ID:
            await interaction.response.send_message("❌ 顧客サーバーで実行してください。", ephemeral=True)
            return

        await interaction.response.defer(thinking=True)

        guild = interaction.guild
        if not guild:
            await interaction.followup.send("❌ サーバー情報を取得できません。")
            return

        mapping = get_customer_by_server_id(str(guild.id))
        if not mapping:
            await interaction.followup.send("❌ このサーバーは未登録です。先に /セットアップ を実行してください。")
            return

        # 既に#プライスリストがあるか確認
        existing = discord.utils.get(guild.text_channels, name="💎【自動応答】プライスリスト") or discord.utils.get(guild.text_channels, name="プライスリスト")
        if existing:
            await interaction.followup.send("❌ 既に #プライスリスト チャンネルがあります。")
            return

        try:
            pricelist_ch = await guild.create_text_channel("💎【自動応答】プライスリスト")

            # DB更新
            upsert_server_customer(
                server_id=str(guild.id),
                server_name=guild.name,
                customer_id=mapping["customer_id"],
                general_channel_id=mapping.get("general_channel_id"),
                invoice_channel_id=mapping.get("invoice_channel_id"),
                label_channel_id=mapping.get("label_channel_id"),
                pricelist_channel_id=str(pricelist_ch.id),
            )

            # オプトインボタンを投稿
            await pricelist_ch.send(
                "**価格表の自動配信**\n"
                "下のボタンを押すと、価格表の更新があった際に\n"
                "このチャンネルに自動で届くようになります。",
                view=PricelistButton(),
            )

            await interaction.followup.send("✅ #プライスリスト チャンネルを追加しました")
        except Exception as e:
            await interaction.followup.send(f"❌ 追加に失敗しました: {e}")


class InventoryCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="価格表作成", description="在庫データから本日の価格表を生成します")
    async def inventory(self, interaction: discord.Interaction):
        from config import MANAGEMENT_SERVER_ID
        if interaction.guild_id != MANAGEMENT_SERVER_ID:
            await interaction.response.send_message("❌ このコマンドは管理サーバーでのみ使用できます。", ephemeral=True)
            return

        await interaction.response.defer()

        from handlers.inventory import fetch_inventory, _load_exclude_keywords, _load_prices, _load_units, _load_location_excludes, _format_location_pricelist
        from config import GOOGLE_APPS_SCRIPT_URL

        if not GOOGLE_APPS_SCRIPT_URL:
            await interaction.followup.send("⚠️ GOOGLE_APPS_SCRIPT_URLが未設定です。")
            return

        await interaction.followup.send("📊 在庫データを取得中...")

        try:
            data = await fetch_inventory("all")
            if not data:
                await interaction.channel.send("⚠️ 在庫データの取得に失敗しました")
                return
            if "error" in data:
                await interaction.channel.send(f"⚠️ APIエラー: {data['error']}")
                return

            exclude_keywords = _load_exclude_keywords()
            prices = _load_prices()
            units = _load_units()

            for location_key, location_label in [("tokyo", "東京"), ("yamaguchi", "山口")]:
                items = data.get(location_key, [])
                location_excludes = _load_location_excludes(location_key)
                text = _format_location_pricelist(items, prices, units, location_label, exclude_keywords, location_excludes)
                if text:
                    while text:
                        chunk = text[:2000]
                        await interaction.channel.send(chunk)
                        text = text[2000:]

        except Exception as e:
            import traceback
            await interaction.channel.send(f"⚠️ エラー: {e}")
            traceback.print_exc()


class ExpenseCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(
        name="立替申請",
        description="このチャンネルのレシート画像をAIで解析し、立替経費精算書とMF仕訳CSVを生成します",
    )
    @app_commands.describe(
        申請者名="申請者名（省略可: チャンネル名が「立替申請-氏名」形式なら自動検出）",
        精算書番号="精算書番号（例: No.34）",
    )
    async def expense_request(
        self,
        interaction: discord.Interaction,
        精算書番号: str,
        申請者名: str | None = None,
    ):
        from handlers.expense import process_expense_request
        await process_expense_request(self.bot, interaction, 申請者名, 精算書番号)


async def setup(bot: commands.Bot):
    await bot.add_cog(SetupCog(bot))
    await bot.add_cog(InventoryCog(bot))
    await bot.add_cog(ExpenseCog(bot))
