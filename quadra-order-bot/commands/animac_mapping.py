"""Quadra商品名 ↔ Animac商品のマッピング管理コマンド"""

import discord
from discord import app_commands
from discord.ext import commands

from db.supabase import get_all_animac_mappings, upsert_animac_mapping, delete_animac_mapping
from handlers.animac_price_sync import get_animac_products
from config import MANAGEMENT_SERVER_ID


class AnimacMappingCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="animac価格マッピング一覧", description="QuadraのDiscord商品名 ↔ Animac商品のマッピング一覧を表示")
    async def mapping_list(self, interaction: discord.Interaction):
        if interaction.guild_id != MANAGEMENT_SERVER_ID:
            await interaction.response.send_message("管理サーバーでのみ使用できます", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        mappings = get_all_animac_mappings()

        if not mappings:
            await interaction.followup.send("マッピングが登録されていません。`/animac価格マッピング登録` で登録してください。", ephemeral=True)
            return

        lines = ["**Quadra ↔ Animac 商品マッピング一覧**\n"]
        for m in mappings:
            lines.append(f"・`{m['quadra_name']}` → {m.get('animac_product_name', m['animac_product_id'])}")

        await interaction.followup.send("\n".join(lines), ephemeral=True)

    @app_commands.command(name="animac価格マッピング登録", description="QuadraのDiscord商品名とAnimac商品を紐付ける")
    @app_commands.describe(
        quadra_name="Discordで使うQuadra商品名（例: ワンピース 頂上決戦）",
        animac_search="Animacの商品名で検索（英語名 or 日本語名の一部）",
    )
    async def mapping_register(self, interaction: discord.Interaction, quadra_name: str, animac_search: str):
        if interaction.guild_id != MANAGEMENT_SERVER_ID:
            await interaction.response.send_message("管理サーバーでのみ使用できます", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)

        products = get_animac_products()
        keyword = animac_search.lower()
        matched = [
            p for p in products
            if keyword in p["name"].lower()
            or (p.get("name_ja") and keyword in p["name_ja"].lower())
        ]

        if not matched:
            await interaction.followup.send(f"「{animac_search}」に一致するAnimac商品が見つかりませんでした。", ephemeral=True)
            return

        if len(matched) == 1:
            p = matched[0]
            upsert_animac_mapping(quadra_name, p["id"], p["name"])
            label = f"{p['name']}" + (f" ({p['name_ja']})" if p.get("name_ja") else "")
            await interaction.followup.send(
                f"✅ マッピング登録完了\n`{quadra_name}` → **{label}**\n\n価格更新時に自動同期されます。",
                ephemeral=True,
            )
        else:
            # 複数候補 → 選択UIを表示（最大25件）
            view = MappingSelectView(quadra_name, matched[:25])
            lines = [f"「{animac_search}」の検索結果 ({len(matched)}件)。登録する商品を選択してください："]
            await interaction.followup.send("\n".join(lines), view=view, ephemeral=True)

    @app_commands.command(name="animac価格マッピング削除", description="Quadra ↔ Animac のマッピングを削除")
    @app_commands.describe(quadra_name="削除するQuadra商品名")
    async def mapping_delete(self, interaction: discord.Interaction, quadra_name: str):
        if interaction.guild_id != MANAGEMENT_SERVER_ID:
            await interaction.response.send_message("管理サーバーでのみ使用できます", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        delete_animac_mapping(quadra_name)
        await interaction.followup.send(f"🗑️ `{quadra_name}` のマッピングを削除しました", ephemeral=True)


class MappingSelectView(discord.ui.View):
    def __init__(self, quadra_name: str, products: list[dict]):
        super().__init__(timeout=60)
        self.quadra_name = quadra_name
        options = []
        for p in products:
            label = p["name"][:100]
            desc = p["name_ja"][:100] if p.get("name_ja") else f"仕入値: {p.get('cost_price', 0):,.0f}円"
            options.append(discord.SelectOption(label=label, description=desc, value=p["id"]))

        select = discord.ui.Select(placeholder="Animac商品を選択...", options=options)
        select.callback = self._on_select
        self._products = {p["id"]: p for p in products}
        self.add_item(select)

    async def _on_select(self, interaction: discord.Interaction):
        product_id = interaction.data["values"][0]
        product = self._products[product_id]
        upsert_animac_mapping(self.quadra_name, product["id"], product["name"])
        label = f"{product['name']}" + (f" ({product['name_ja']})" if product.get("name_ja") else "")
        await interaction.response.edit_message(
            content=f"✅ マッピング登録完了\n`{self.quadra_name}` → **{label}**\n\n価格更新時に自動同期されます。",
            view=None,
        )


async def setup(bot: commands.Bot):
    await bot.add_cog(AnimacMappingCog(bot))
