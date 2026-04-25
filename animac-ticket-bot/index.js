require("dotenv").config({ override: true });
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
} = require("discord.js");
const Anthropic = require("@anthropic-ai/sdk").default;
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// ========== Supabase ==========
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  console.log("Supabase connected");
} else {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY not set. Order features disabled.");
}
const TENANT_ID =
  process.env.ANIMAC_TENANT_ID || "a0000000-0000-0000-0000-000000000001";
const ORDER_SITE_URL =
  process.env.ORDER_SITE_URL || "https://animac.intl.shipord.jp";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful sales assistant for animac TCG, a Japanese trading card shop that exports Pokémon and One Piece cards worldwide.

Your job:
- Help customers find Pokémon and One Piece cards
- Provide pricing in USD
- Explain shipping to USA/Canada (~$12-18, EMS 7-14 days) and Europe (~$14-20, EMS 10-16 days)
- Payment via PayPal or credit card
- Cards ship from Japan within 1-2 business days
- If unsure about a card price, say "Let me check on that for you!"

Always respond in English. Be friendly, professional and concise.`;

const WELCOME_MESSAGE = `Hey 👋 Welcome to animac TCG!

My name is Shiori from Tokyo, Japan 🇯🇵
I'll be helping you find the best cards!

Please let us know:
🃏 What cards are you looking for?
📦 Where are you shipping to? (Country / State)
🔢 How many copies do you need?

We'll get back to you with pricing shortly!
— animac TCG Team 🗼`;

// ========== Reply Templates ==========
const REPLY_TEMPLATES = {
  shipping_info: {
    label: "📦 Shipping Info Request",
    message: `📦 **Shipping Information Required**

To complete your order, could you please provide the following details?

1️⃣ **Full Name**
2️⃣ **Shipping Address** (Street, City, State/Province, Zip Code, Country)
3️⃣ **Phone Number**
4️⃣ **Email Address**

We'll send you an invoice to your email once we have your info!
Thank you 🙏`,
  },
};

// Track ticket counter per guild
const ticketCounters = new Map();

// ========== Level System ==========
const LEVELS_FILE = path.join(__dirname, "levels.json");
const XP_PER_MESSAGE = 15;
const XP_COOLDOWN_MS = 60000;
const xpCooldowns = new Map();

function getLevel(xp) {
  let level = 0;
  while ((level + 1) * (level + 1) * 100 <= xp) {
    level++;
  }
  return level;
}

function getXpForLevel(level) {
  return level * level * 100;
}

function loadLevels() {
  try {
    if (fs.existsSync(LEVELS_FILE)) {
      return JSON.parse(fs.readFileSync(LEVELS_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Error loading levels:", err);
  }
  return {};
}

function saveLevels(data) {
  try {
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving levels:", err);
  }
}

const LEVEL_ROLES = {
  5: "Level 5",
  10: "Level 10",
  20: "Level 20",
  30: "Level 30",
};

async function getNextTicketNumber(guild) {
  const channels = await guild.channels.fetch();
  let maxNum = 0;
  channels.forEach((ch) => {
    if (ch && ch.name && ch.name.startsWith("ticket-")) {
      const num = parseInt(ch.name.replace("ticket-", ""));
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return maxNum + 1;
}

// ========== Order System ==========
// Draft orders keyed by channel ID
const draftOrders = new Map();

function isStaffOrAdmin(member) {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const hasStaffRole = member.roles.cache.some(
    (r) => r.name === "管理者" || r.name === "スタッフ"
  );
  return isAdmin || hasStaffRole;
}

function createEmptyDraft() {
  return {
    customer_id: null,
    customer_name: "",
    created_by: null,
    created_by_name: "",
    // Billing
    billing_name: "",
    billing_country: "",
    billing_address: "",
    billing_email: "",
    billing_phone: "",
    billing_tax_id: "",
    // Shipping
    same_as_billing: true,
    shipping_name: "",
    shipping_country: "",
    shipping_address: "",
    shipping_email: "",
    shipping_phone: "",
    // Items
    items: [],
    // Fees
    shipping_fee: 0,
    discount: 0,
    currency: "USD",
  };
}

function buildDraftEmbed(draft) {
  const billing = [
    draft.billing_name,
    draft.billing_address,
    draft.billing_country,
    draft.billing_email ? `Email: ${draft.billing_email}` : "",
    draft.billing_phone ? `Phone: ${draft.billing_phone}` : "",
    draft.billing_tax_id ? `Tax ID: ${draft.billing_tax_id}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let shippingText;
  if (draft.same_as_billing) {
    shippingText = "Same as billing";
  } else {
    shippingText = [
      draft.shipping_name,
      draft.shipping_address,
      draft.shipping_country,
      draft.shipping_email ? `Email: ${draft.shipping_email}` : "",
      draft.shipping_phone ? `Phone: ${draft.shipping_phone}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  let itemLines =
    draft.items.length > 0
      ? draft.items
          .map(
            (it, i) =>
              `${i + 1}. ${it.product_name} x${it.quantity}  $${(it.price * it.quantity).toFixed(2)}`
          )
          .join("\n")
      : "No items added yet";

  const subtotal = draft.items.reduce(
    (sum, it) => sum + it.price * it.quantity,
    0
  );
  const total = subtotal + draft.shipping_fee - draft.discount;

  const embed = new EmbedBuilder()
    .setColor(0xf0ad4e)
    .setTitle("📝 Draft Order")
    .addFields(
      {
        name: "👤 Customer",
        value: draft.customer_name || "Not selected",
        inline: true,
      },
      {
        name: "📋 Staff",
        value: draft.created_by_name || "Not selected",
        inline: true,
      },
      { name: "\u200B", value: "\u200B", inline: true },
      { name: "📄 Billing Info", value: billing || "Not set", inline: true },
      { name: "📦 Shipping Info", value: shippingText || "Not set", inline: true },
      { name: "\u200B", value: "\u200B", inline: true },
      { name: "🛒 Items", value: itemLines },
      {
        name: "💰 Summary",
        value:
          `Subtotal: $${subtotal.toFixed(2)}\n` +
          `Shipping: $${draft.shipping_fee.toFixed(2)}\n` +
          `Discount: -$${draft.discount.toFixed(2)}\n` +
          `**Total: $${total.toFixed(2)}**`,
      }
    )
    .setFooter({ text: "Use buttons below to edit, or /item to add products" });

  return embed;
}

function buildDraftButtons(channelId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`draft_edit_billing_${channelId}`)
      .setLabel("📄 Edit Billing")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`draft_edit_shipping_${channelId}`)
      .setLabel("📦 Edit Shipping")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`draft_edit_fees_${channelId}`)
      .setLabel("💰 Fees/Discount")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`draft_remove_item_${channelId}`)
      .setLabel("🗑 Remove Item")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`draft_finalize_${channelId}`)
      .setLabel("✅ Create Order")
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

async function createOrderInSupabase(draft) {
  const shippingName = draft.same_as_billing
    ? draft.billing_name
    : draft.shipping_name;
  const shippingAddress = draft.same_as_billing
    ? draft.billing_address
    : draft.shipping_address;
  const shippingCountry = draft.same_as_billing
    ? draft.billing_country
    : draft.shipping_country;
  const shippingEmail = draft.same_as_billing
    ? draft.billing_email
    : draft.shipping_email;
  const shippingPhone = draft.same_as_billing
    ? draft.billing_phone
    : draft.shipping_phone;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      tenant_id: TENANT_ID,
      customer_id: draft.customer_id || null,
      created_by: draft.created_by || null,
      channel: "dc",
      status: "受注",
      billing_name: draft.billing_name,
      billing_country: draft.billing_country,
      billing_address: draft.billing_address,
      billing_email: draft.billing_email,
      billing_phone: draft.billing_phone,
      billing_tax_id: draft.billing_tax_id,
      shipping_name: shippingName,
      shipping_country: shippingCountry,
      shipping_address: shippingAddress,
      shipping_email: shippingEmail,
      shipping_phone: shippingPhone,
      shipping_fee: draft.shipping_fee,
      discount: draft.discount,
      handling_fee: 0,
      currency: draft.currency,
      notes: draft.notes || "",
    })
    .select("id, order_number")
    .single();

  if (orderError) throw orderError;

  const items = draft.items.map((item, i) => ({
    tenant_id: TENANT_ID,
    order_id: order.id,
    product_name_en: item.product_name,
    unit_price: item.price,
    quantity: item.quantity,
    cost_price: item.cost_price || null,
    sort_order: i,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(items);

  if (itemsError) {
    await supabase.from("orders").delete().eq("id", order.id);
    throw itemsError;
  }

  return order;
}

// ========== Slash Command Registration ==========
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const shippingCommand = new SlashCommandBuilder()
    .setName("shipping")
    .setDescription("Calculate shipping cost")
    .addStringOption((opt) =>
      opt
        .setName("country")
        .setDescription("Destination country")
        .setRequired(true)
        .addChoices(
          { name: "🇺🇸 USA / Canada", value: "usa" },
          { name: "🇬🇧 UK / Netherlands", value: "uk" },
          { name: "🇦🇪 Dubai / UAE", value: "dubai" },
          { name: "🇭🇰 Hong Kong", value: "hk" },
          { name: "🇹🇼 Taiwan", value: "taiwan" },
          { name: "🇸🇬 Singapore", value: "singapore" },
          { name: "🇦🇺 Australia", value: "australia" }
        )
    )
    .addNumberOption((opt) =>
      opt
        .setName("weight")
        .setDescription("Weight in kg")
        .setRequired(true)
        .setMinValue(0.1)
        .setMaxValue(20)
    );

  const rankCommand = new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your level and XP")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to check").setRequired(false)
    );

  const leaderboardCommand = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the top 10 members by level");

  const replyCommand = new SlashCommandBuilder()
    .setName("reply")
    .setDescription("Send a template reply in a ticket")
    .addStringOption((opt) =>
      opt
        .setName("template")
        .setDescription("Template to send")
        .setRequired(true)
        .addChoices(
          ...Object.entries(REPLY_TEMPLATES).map(([key, val]) => ({
            name: val.label,
            value: key,
          }))
        )
    );

  const confirmCommand = new SlashCommandBuilder()
    .setName("confirm")
    .setDescription("Create an order for this ticket")
    .addStringOption((opt) =>
      opt
        .setName("customer")
        .setDescription("Search customer by name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("staff")
        .setDescription("Staff in charge")
        .setRequired(true)
        .setAutocomplete(true)
    );

  const itemCommand = new SlashCommandBuilder()
    .setName("item")
    .setDescription("Add a product to the draft order")
    .addStringOption((opt) =>
      opt
        .setName("product")
        .setDescription("Search product by name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("qty")
        .setDescription("Quantity")
        .setRequired(true)
        .setMinValue(1)
    )
    .addNumberOption((opt) =>
      opt
        .setName("price")
        .setDescription("Override price (USD) — leave blank to use DB price")
        .setRequired(false)
        .setMinValue(0)
    );

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [
        shippingCommand.toJSON(),
        rankCommand.toJSON(),
        leaderboardCommand.toJSON(),
        replyCommand.toJSON(),
        confirmCommand.toJSON(),
        itemCommand.toJSON(),
      ],
    });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }

  // Add スタッフ role to existing ticket channels
  for (const guild of client.guilds.cache.values()) {
    const staffRole = guild.roles.cache.find((r) => r.name === "スタッフ");
    if (!staffRole) continue;

    const channels = await guild.channels.fetch();
    for (const [, channel] of channels) {
      if (!channel || !channel.name.startsWith("ticket-")) continue;
      const existing = channel.permissionOverwrites.cache.get(staffRole.id);
      if (!existing) {
        await channel.permissionOverwrites.edit(staffRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        console.log(`Added スタッフ role to existing ticket: ${channel.name}`);
      }
    }
  }
});

// ========== Interaction Handler ==========
client.on("interactionCreate", async (interaction) => {
  // ===== Autocomplete =====
  if (interaction.isAutocomplete()) {
    if (!supabase) {
      await interaction.respond([]);
      return;
    }

    try {
      const focused = interaction.options.getFocused(true);

      if (
        interaction.commandName === "confirm" &&
        focused.name === "customer"
      ) {
        const query = focused.value;
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, account_name, country")
          .eq("tenant_id", TENANT_ID)
          .ilike("name", `%${query}%`)
          .order("name")
          .limit(25);

        if (error) {
          console.error("Customer autocomplete error:", error);
          await interaction.respond([]);
          return;
        }

        const choices = (data || []).map((c) => ({
          name: `${c.name}${c.country ? ` (${c.country})` : ""}`.slice(0, 100),
          value: c.id,
        }));
        if (query.length > 0) {
          choices.unshift({
            name: `+ New: ${query}`,
            value: `new:${query}`,
          });
        }
        await interaction.respond(choices.slice(0, 25));
        return;
      }

      if (interaction.commandName === "confirm" && focused.name === "staff") {
        const query = focused.value;
        const { data, error } = await supabase
          .from("organization_members")
          .select("user_id, profiles(id, display_name)")
          .eq("organization_id", TENANT_ID)
          .limit(25);

        if (error) {
          console.error("Staff autocomplete error:", error);
          // Fallback: query profiles directly
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name")
            .ilike("display_name", `%${query}%`)
            .limit(25);

          const choices = (profiles || []).map((p) => ({
            name: p.display_name || p.id.slice(0, 8),
            value: p.id,
          }));
          await interaction.respond(choices.slice(0, 25));
          return;
        }

        const choices = (data || [])
          .filter((m) => m.profiles)
          .map((m) => ({
            name: (m.profiles.display_name || m.user_id.slice(0, 8)).slice(0, 100),
            value: m.profiles.id,
          }))
          .filter((c) =>
            query.length === 0 || c.name.toLowerCase().includes(query.toLowerCase())
          );
        await interaction.respond(choices.slice(0, 25));
        return;
      }

      if (interaction.commandName === "item" && focused.name === "product") {
        const query = focused.value;
        const { data, error } = await supabase
          .from("products")
          .select("id, name, unit_price, currency")
          .eq("tenant_id", TENANT_ID)
          .eq("is_public", true)
          .ilike("name", `%${query}%`)
          .order("sort_order")
          .limit(24);

        if (error) {
          console.error("Product autocomplete error:", error);
          await interaction.respond([]);
          return;
        }

        const choices = (data || []).map((p) => ({
          name: `${p.name} ($${p.unit_price})`.slice(0, 100),
          value: p.id,
        }));
        if (query.length > 0) {
          choices.push({
            name: `+ Custom: ${query}`,
            value: `custom:${query}`,
          });
        }
        await interaction.respond(choices.slice(0, 25));
        return;
      }

      await interaction.respond([]);
    } catch (err) {
      console.error("Autocomplete error:", err);
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  // ===== /confirm → create draft with customer + staff =====
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "confirm"
  ) {
    if (!interaction.channel.name.startsWith("ticket-")) {
      await interaction.reply({
        content: "❌ This command can only be used in ticket channels.",
        flags: 64,
      });
      return;
    }
    if (!isStaffOrAdmin(interaction.member)) {
      await interaction.reply({ content: "❌ Permission denied", flags: 64 });
      return;
    }

    await interaction.deferReply();

    const customerValue = interaction.options.getString("customer");
    const staffId = interaction.options.getString("staff");
    const channelId = interaction.channel.id;

    const draft = createEmptyDraft();

    // Set staff
    draft.created_by = staffId;
    const { data: staffData } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", staffId)
      .single();
    draft.created_by_name = staffData?.display_name || "Unknown";

    // Set customer
    if (customerValue.startsWith("new:")) {
      const newName = customerValue.slice(4);
      draft.customer_name = newName;
      draft.billing_name = newName;
    } else {
      const { data: customer } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerValue)
        .eq("tenant_id", TENANT_ID)
        .single();

      if (customer) {
        draft.customer_id = customer.id;
        draft.customer_name = customer.name;
        draft.billing_name = customer.name;
        draft.billing_country = customer.country || "";
        draft.billing_address = customer.address || "";
        draft.billing_email = customer.email || "";
        draft.billing_phone = customer.phone || "";
        draft.billing_tax_id = customer.tax_id || "";
      }
    }

    draft.notes = `Discord ticket: ${interaction.channel.name}`;
    draftOrders.set(channelId, draft);

    const embed = buildDraftEmbed(draft);
    const buttons = buildDraftButtons(channelId);

    await interaction.editReply({ embeds: [embed], components: buttons });
    return;
  }

  // ===== /item → add product to draft =====
  if (interaction.isChatInputCommand() && interaction.commandName === "item") {
    if (!interaction.channel.name.startsWith("ticket-")) {
      await interaction.reply({
        content: "❌ This command can only be used in ticket channels.",
        flags: 64,
      });
      return;
    }
    if (!isStaffOrAdmin(interaction.member)) {
      await interaction.reply({ content: "❌ Permission denied", flags: 64 });
      return;
    }

    const channelId = interaction.channel.id;
    const draft = draftOrders.get(channelId);
    if (!draft) {
      await interaction.reply({
        content: "❌ No draft order. Use `/confirm` first.",
        flags: 64,
      });
      return;
    }

    const productValue = interaction.options.getString("product");
    const qty = interaction.options.getInteger("qty");
    const priceOverride = interaction.options.getNumber("price");

    let productName;
    let price;
    let costPrice = null;

    if (productValue.startsWith("custom:")) {
      productName = productValue.slice(7);
      price = priceOverride || 0;
      if (price <= 0) {
        await interaction.reply({
          content: "❌ Custom items require a price. Use: `/item product:name qty:1 price:100`",
          flags: 64,
        });
        return;
      }
    } else {
      const { data: product } = await supabase
        .from("products")
        .select("id, name, unit_price, cost_price")
        .eq("id", productValue)
        .eq("tenant_id", TENANT_ID)
        .single();

      if (!product) {
        await interaction.reply({
          content: "❌ Product not found.",
          flags: 64,
        });
        return;
      }

      productName = product.name;
      price = priceOverride ?? product.unit_price;
      costPrice = product.cost_price || null;
    }

    draft.items.push({
      product_name: productName,
      price,
      quantity: qty,
      cost_price: costPrice,
    });

    const embed = buildDraftEmbed(draft);
    const buttons = buildDraftButtons(channelId);

    await interaction.reply({ embeds: [embed], components: buttons });
    return;
  }

  // ===== Button handlers =====
  if (interaction.isButton()) {
    const id = interaction.customId;

    // --- Edit Billing ---
    if (id.startsWith("draft_edit_billing_")) {
      const channelId = id.replace("draft_edit_billing_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_billing_${channelId}`)
        .setTitle("📄 Edit Billing Info");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("billing_name")
            .setLabel("Billing Name")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.billing_name)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("billing_country")
            .setLabel("Country")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.billing_country)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("billing_address")
            .setLabel("Address")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(draft.billing_address)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("billing_contact")
            .setLabel("Email / Phone / Tax ID (one per line)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(
              [draft.billing_email, draft.billing_phone, draft.billing_tax_id]
                .filter(Boolean)
                .join("\n")
            )
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // --- Edit Shipping ---
    if (id.startsWith("draft_edit_shipping_")) {
      const channelId = id.replace("draft_edit_shipping_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }

      // Toggle off "same as billing" and open shipping modal
      draft.same_as_billing = false;

      const modal = new ModalBuilder()
        .setCustomId(`modal_shipping_${channelId}`)
        .setTitle("📦 Edit Shipping Info");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("shipping_name")
            .setLabel("Recipient Name")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.shipping_name || draft.billing_name)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("shipping_country")
            .setLabel("Country")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.shipping_country || draft.billing_country)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("shipping_address")
            .setLabel("Address")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(draft.shipping_address || draft.billing_address)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("shipping_contact")
            .setLabel("Email / Phone (one per line)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(
              [
                draft.shipping_email || draft.billing_email,
                draft.shipping_phone || draft.billing_phone,
              ]
                .filter(Boolean)
                .join("\n")
            )
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // --- Edit Fees ---
    if (id.startsWith("draft_edit_fees_")) {
      const channelId = id.replace("draft_edit_fees_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_fees_${channelId}`)
        .setTitle("💰 Shipping Fee & Discount");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("shipping_fee")
            .setLabel("Shipping Fee (USD)")
            .setStyle(TextInputStyle.Short)
            .setValue(String(draft.shipping_fee))
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("discount")
            .setLabel("Discount (USD)")
            .setStyle(TextInputStyle.Short)
            .setValue(String(draft.discount))
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("currency")
            .setLabel("Currency (USD / JPY)")
            .setStyle(TextInputStyle.Short)
            .setValue(draft.currency)
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // --- Remove Last Item ---
    if (id.startsWith("draft_remove_item_")) {
      const channelId = id.replace("draft_remove_item_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }

      if (draft.items.length === 0) {
        await interaction.reply({
          content: "❌ No items to remove.",
          flags: 64,
        });
        return;
      }

      const removed = draft.items.pop();
      const embed = buildDraftEmbed(draft);
      const buttons = buildDraftButtons(channelId);

      await interaction.reply({
        content: `🗑 Removed: ${removed.product_name}`,
        embeds: [embed],
        components: buttons,
      });
      return;
    }

    // --- Finalize Order ---
    if (id.startsWith("draft_finalize_")) {
      const channelId = id.replace("draft_finalize_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }
      if (!isStaffOrAdmin(interaction.member)) {
        await interaction.reply({
          content: "❌ Permission denied",
          flags: 64,
        });
        return;
      }

      if (draft.items.length === 0) {
        await interaction.reply({
          content: "❌ Add at least one item with `/item` before creating the order.",
          flags: 64,
        });
        return;
      }

      await interaction.deferReply();

      try {
        const order = await createOrderInSupabase(draft);
        draftOrders.delete(channelId);

        const subtotal = draft.items.reduce(
          (sum, it) => sum + it.price * it.quantity,
          0
        );
        const total = subtotal + draft.shipping_fee - draft.discount;
        const cur = draft.currency === "JPY" ? "¥" : "$";

        const itemLines = draft.items
          .map(
            (it, i) =>
              `${i + 1}. ${it.product_name} x${it.quantity}  ${cur}${(it.price * it.quantity).toFixed(2)}`
          )
          .join("\n");

        const embed = new EmbedBuilder()
          .setColor(0x388e3c)
          .setTitle(`✅ Order ${order.order_number} Created`)
          .addFields(
            {
              name: "👤 Customer",
              value: draft.customer_name || "N/A",
              inline: true,
            },
            {
              name: "📋 Staff",
              value: draft.created_by_name || "N/A",
              inline: true,
            },
            { name: "\u200B", value: "\u200B", inline: true },
            { name: "🛒 Items", value: itemLines },
            {
              name: "💰 Total",
              value: `**${cur}${total.toFixed(2)} ${draft.currency}**`,
            }
          )
          .setFooter({
            text: "Select payment method below",
          });

        const paymentButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`payment_wise_${order.id}`)
            .setLabel("💳 Wise")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`payment_paypal_${order.id}`)
            .setLabel("🅿️ PayPal")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setLabel("📋 Open in Dashboard")
            .setStyle(ButtonStyle.Link)
            .setURL(`${ORDER_SITE_URL}/orders/${order.id}`)
        );

        await interaction.editReply({
          embeds: [embed],
          components: [paymentButtons],
        });
      } catch (err) {
        console.error("Error creating order:", err);
        await interaction.editReply(
          "❌ Failed to create order: " + err.message
        );
      }
      return;
    }

    // --- Payment Method Buttons ---
    if (id.startsWith("payment_")) {
      if (!isStaffOrAdmin(interaction.member)) {
        await interaction.reply({
          content: "❌ Permission denied",
          flags: 64,
        });
        return;
      }

      const parts = id.split("_");
      const method = parts[1];
      const orderId = parts.slice(2).join("_");
      const paymentMethod = method === "paypal" ? "PayPal" : "Wise";

      try {
        const { error } = await supabase
          .from("orders")
          .update({ payment_method: paymentMethod })
          .eq("id", orderId)
          .eq("tenant_id", TENANT_ID);

        if (error) throw error;

        await interaction.reply(
          `✅ Payment method set to **${paymentMethod}**\n` +
            `→ Send the invoice from the dashboard:\n` +
            `${ORDER_SITE_URL}/orders/${orderId}`
        );
      } catch (err) {
        console.error("Error setting payment method:", err);
        await interaction.reply({
          content: "❌ Failed to update: " + err.message,
          flags: 64,
        });
      }
      return;
    }

    // --- Ticket Buttons ---
    if (id === "create_ticket") {
      const guild = interaction.guild;
      const member = interaction.member;

      const username = member.user.username
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");
      const channelName = `ticket-${username}`;

      const channels = await guild.channels.fetch();
      const existingTicket = channels.find(
        (ch) => ch && ch.name === channelName
      );
      if (existingTicket) {
        await interaction.reply({
          content: `You already have an open ticket! → <#${existingTicket.id}>`,
          flags: 64,
        });
        return;
      }

      try {
        const staffRole = guild.roles.cache.find((r) => r.name === "スタッフ");

        const permissionOverwrites = [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ];

        if (staffRole) {
          permissionOverwrites.push({
            id: staffRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }

        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites,
        });

        const embed = new EmbedBuilder()
          .setColor(0x388e3c)
          .setTitle("🎴 animac TCG Support")
          .setDescription(
            `Welcome <@${member.id}>!\n\nA team member will be with you shortly.\nIn the meantime, feel free to describe what you need!`
          )
          .setFooter({ text: "animac TCG — Shipped from Japan 🇯🇵" });

        const closeButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("🔒 Close Ticket")
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
          embeds: [embed],
          components: [closeButton],
        });

        await interaction.reply({
          content: `✅ Ticket created! → <#${ticketChannel.id}>`,
          flags: 64,
        });
      } catch (err) {
        console.error("Error creating ticket:", err);
        await interaction.reply({
          content: "❌ Failed to create ticket. Please try again.",
          flags: 64,
        });
      }
      return;
    }

    if (id === "close_ticket") {
      await interaction.reply(
        "🔒 This ticket will be closed in 5 seconds..."
      );
      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (err) {
          console.error("Error closing ticket:", err);
        }
      }, 5000);
      return;
    }
  }

  // ===== Modal submits =====
  if (interaction.isModalSubmit()) {
    const id = interaction.customId;

    // --- Billing Modal ---
    if (id.startsWith("modal_billing_")) {
      const channelId = id.replace("modal_billing_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }

      draft.billing_name =
        interaction.fields.getTextInputValue("billing_name");
      draft.billing_country =
        interaction.fields.getTextInputValue("billing_country");
      draft.billing_address =
        interaction.fields.getTextInputValue("billing_address");

      const contactLines = (
        interaction.fields.getTextInputValue("billing_contact") || ""
      )
        .split("\n")
        .map((l) => l.trim());

      // Parse: email, phone, tax_id from lines
      draft.billing_email = "";
      draft.billing_phone = "";
      draft.billing_tax_id = "";
      for (const line of contactLines) {
        if (!line) continue;
        if (line.includes("@")) {
          draft.billing_email = line;
        } else if (/^[\d+\-(). ]{7,}$/.test(line)) {
          draft.billing_phone = line;
        } else {
          draft.billing_tax_id = line;
        }
      }

      const embed = buildDraftEmbed(draft);
      const buttons = buildDraftButtons(channelId);
      await interaction.reply({
        content: "✅ Billing info updated",
        embeds: [embed],
        components: buttons,
      });
      return;
    }

    // --- Shipping Modal ---
    if (id.startsWith("modal_shipping_")) {
      const channelId = id.replace("modal_shipping_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }

      draft.same_as_billing = false;
      draft.shipping_name =
        interaction.fields.getTextInputValue("shipping_name");
      draft.shipping_country =
        interaction.fields.getTextInputValue("shipping_country");
      draft.shipping_address =
        interaction.fields.getTextInputValue("shipping_address");

      const contactLines = (
        interaction.fields.getTextInputValue("shipping_contact") || ""
      )
        .split("\n")
        .map((l) => l.trim());

      draft.shipping_email = "";
      draft.shipping_phone = "";
      for (const line of contactLines) {
        if (!line) continue;
        if (line.includes("@")) {
          draft.shipping_email = line;
        } else {
          draft.shipping_phone = line;
        }
      }

      const embed = buildDraftEmbed(draft);
      const buttons = buildDraftButtons(channelId);
      await interaction.reply({
        content: "✅ Shipping info updated",
        embeds: [embed],
        components: buttons,
      });
      return;
    }

    // --- Fees Modal ---
    if (id.startsWith("modal_fees_")) {
      const channelId = id.replace("modal_fees_", "");
      const draft = draftOrders.get(channelId);
      if (!draft) {
        await interaction.reply({ content: "❌ No draft found.", flags: 64 });
        return;
      }

      draft.shipping_fee =
        parseFloat(
          interaction.fields.getTextInputValue("shipping_fee")
        ) || 0;
      draft.discount =
        parseFloat(interaction.fields.getTextInputValue("discount")) || 0;
      draft.currency =
        interaction.fields.getTextInputValue("currency")?.toUpperCase() ||
        "USD";

      const embed = buildDraftEmbed(draft);
      const buttons = buildDraftButtons(channelId);
      await interaction.reply({
        content: "✅ Fees updated",
        embeds: [embed],
        components: buttons,
      });
      return;
    }
  }

  // ===== Slash commands (shipping, reply, rank, leaderboard) =====
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "shipping") {
      if (!interaction.channel.name.includes("moderator-only")) {
        await interaction.reply({
          content: "❌ This command can only be used in #moderator-only",
          flags: 64,
        });
        return;
      }
      if (!isStaffOrAdmin(interaction.member)) {
        await interaction.reply({
          content: "❌ Permission denied",
          flags: 64,
        });
        return;
      }

      const region = interaction.options.getString("country");
      const weight = interaction.options.getNumber("weight");
      const results = lookupShipping(region, weight);

      if (results.length === 0) {
        await interaction.reply(
          "❌ No shipping options available for this region/weight."
        );
        return;
      }

      results.sort((a, b) => a.price - b.price);

      const regionLabel = shippingData.regionLabels[region] || region;
      let response = `📦 **Shipping to ${regionLabel}** (${weight}kg)\n`;
      response += "━━━━━━━━━━━━━━━━━━━━━━\n";

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const tag = i === 0 ? " ⭐ **Best Price!**" : "";
        const medal =
          i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "📦";
        response += `\n${medal} **${r.carrier}**${tag}\n`;
        response += `💴 ¥${r.price.toLocaleString()}\n`;
      }

      response += "\n━━━━━━━━━━━━━━━━━━━━━━";
      response += "\n💡 手数料・燃油サーチャージ込み";

      await interaction.reply(response);
      return;
    }

    if (interaction.commandName === "reply") {
      if (!interaction.channel.name.startsWith("ticket-")) {
        await interaction.reply({
          content: "❌ This command can only be used in ticket channels.",
          flags: 64,
        });
        return;
      }
      if (!isStaffOrAdmin(interaction.member)) {
        await interaction.reply({
          content: "❌ Permission denied",
          flags: 64,
        });
        return;
      }

      const templateKey = interaction.options.getString("template");
      const template = REPLY_TEMPLATES[templateKey];
      if (!template) {
        await interaction.reply({
          content: "❌ Template not found.",
          flags: 64,
        });
        return;
      }
      await interaction.reply(template.message);
      return;
    }

    if (interaction.commandName === "rank") {
      const target = interaction.options.getUser("user") || interaction.user;
      const levels = loadLevels();
      const userData = levels[target.id] || { xp: 0, messages: 0 };
      const level = getLevel(userData.xp);
      const nextLevelXp = getXpForLevel(level + 1);
      const currentLevelXp = getXpForLevel(level);
      const progress = userData.xp - currentLevelXp;
      const needed = nextLevelXp - currentLevelXp;
      const barLength = 20;
      const filled = Math.round((progress / needed) * barLength);
      const bar = "█".repeat(filled) + "░".repeat(barLength - filled);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${target.username}'s Rank`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "Level", value: `${level}`, inline: true },
          {
            name: "XP",
            value: `${userData.xp} / ${nextLevelXp}`,
            inline: true,
          },
          {
            name: "Messages",
            value: `${userData.messages || 0}`,
            inline: true,
          },
          { name: "Progress", value: `${bar} ${progress}/${needed}` }
        )
        .setFooter({ text: "animac TCG — Level System" });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const levels = loadLevels();
      const sorted = Object.entries(levels)
        .sort((a, b) => b[1].xp - a[1].xp)
        .slice(0, 10);

      if (sorted.length === 0) {
        await interaction.reply("No ranking data yet!");
        return;
      }

      let description = "";
      for (let i = 0; i < sorted.length; i++) {
        const [userId, data] = sorted[i];
        const level = getLevel(data.xp);
        const medal =
          i === 0
            ? "🥇"
            : i === 1
              ? "🥈"
              : i === 2
                ? "🥉"
                : `**${i + 1}.**`;
        description += `${medal} <@${userId}> — Level **${level}** (${data.xp} XP)\n`;
      }

      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🏆 Leaderboard — Top 10")
        .setDescription(description)
        .setFooter({ text: "animac TCG — Level System" });

      await interaction.reply({ embeds: [embed] });
      return;
    }
  }
});

// ========== Shipping Rates ==========
delete require.cache[require.resolve("./shipping-rates.json")];
const shippingData = require("./shipping-rates.json");

function lookupShipping(region, weightKg) {
  const results = [];

  for (const [carrierId, carrier] of Object.entries(shippingData.carriers)) {
    const regionIndex = carrier.regions.indexOf(region);
    if (regionIndex === -1) continue;

    const rateRow = carrier.rates.find((r) => weightKg <= r[0]);
    if (!rateRow) continue;

    const price = rateRow[regionIndex + 1];
    if (price === null) continue;

    results.push({ carrier: carrier.name, price });
  }

  return results;
}

// ========== Message Handler ==========
client.on("messageCreate", async (message) => {
  // Shipping command (text-based)
  if (message.content.startsWith("!shipping")) {
    if (!message.channel.name.includes("moderator-only")) return;

    const isAdmin = message.member.permissions.has(
      PermissionFlagsBits.Administrator
    );
    const hasStaffRole = message.member.roles.cache.some(
      (r) => r.name === "管理者" || r.name === "スタッフ"
    );
    if (!isAdmin && !hasStaffRole) return;

    const args = message.content.split(/\s+/).slice(1);

    if (args.length < 2) {
      await message.channel.send(
        "📦 **Usage:** `!shipping <country> <weight_kg>`\n" +
          "**Example:** `!shipping USA 3.5`\n\n" +
          "**Available regions:**\n" +
          "🇺🇸 USA / Canada\n" +
          "🇬🇧 UK / Netherlands (Europe)\n" +
          "🇦🇪 Dubai / UAE\n" +
          "🇭🇰 Hong Kong\n" +
          "🇹🇼 Taiwan\n" +
          "🇸🇬 Singapore\n" +
          "🇦🇺 Australia"
      );
      return;
    }

    const regionInput = args[0].toLowerCase();
    const weight = parseFloat(args[1]);

    if (isNaN(weight) || weight <= 0) {
      await message.channel.send(
        "❌ Invalid weight. Please enter a number in kg (e.g., `3.5`)"
      );
      return;
    }

    if (weight > 20) {
      await message.channel.send(
        "❌ Maximum weight is 20kg. Please contact us for larger shipments."
      );
      return;
    }

    const region = shippingData.regionAliases[regionInput];
    if (!region) {
      await message.channel.send(
        "❌ Unknown region. Available: `USA`, `UK`, `Dubai`, `HK`, `Taiwan`, `Singapore`, `Australia`"
      );
      return;
    }

    const results = lookupShipping(region, weight);

    if (results.length === 0) {
      await message.channel.send(
        "❌ No shipping options available for this region/weight."
      );
      return;
    }

    results.sort((a, b) => a.price - b.price);

    const regionLabel = shippingData.regionLabels[region] || region;
    let response = `📦 **Shipping to ${regionLabel}** (${weight}kg)\n`;
    response += "━━━━━━━━━━━━━━━━━━━━━━\n";

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const tag = i === 0 ? " ⭐ **Best Price!**" : "";
      const medal =
        i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "📦";
      response += `\n${medal} **${r.carrier}**${tag}\n`;
      response += `💴 ¥${r.price.toLocaleString()}\n`;
    }

    response += "\n━━━━━━━━━━━━━━━━━━━━━━";
    response += "\n💡 手数料・燃油サーチャージ込み";

    await message.channel.send(response);
    return;
  }

  // Panel setup command
  if (
    message.content === "!setup-panel" &&
    message.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    const embed = new EmbedBuilder()
      .setColor(0x388e3c)
      .setTitle("🎴 animac TCG Support")
      .setDescription(
        "Click the button below to open a ticket!\n\n" +
          "🛒 Purchase cards\n" +
          "📦 Track your order\n" +
          "❓ Ask a question\n\n" +
          "Our team will respond shortly!"
      )
      .setFooter({ text: "animac TCG — Shipped from Japan 🇯🇵" });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel("📩 Create Ticket")
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [button] });
    await message.delete().catch(() => {});
    return;
  }

  // Ignore bot messages
  if (message.author.bot) return;

  // ===== Level System: XP gain =====
  const now = Date.now();
  const lastXp = xpCooldowns.get(message.author.id) || 0;
  if (now - lastXp >= XP_COOLDOWN_MS) {
    xpCooldowns.set(message.author.id, now);
    const levels = loadLevels();
    if (!levels[message.author.id]) {
      levels[message.author.id] = { xp: 0, messages: 0 };
    }
    const oldLevel = getLevel(levels[message.author.id].xp);
    levels[message.author.id].xp += XP_PER_MESSAGE;
    levels[message.author.id].messages =
      (levels[message.author.id].messages || 0) + 1;
    const newLevel = getLevel(levels[message.author.id].xp);
    saveLevels(levels);

    if (newLevel > oldLevel) {
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🎉 Level Up!")
        .setDescription(
          `Congratulations <@${message.author.id}>!\nYou reached **Level ${newLevel}**!`
        )
        .setFooter({ text: "animac TCG — Level System" });
      message.channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  // Only respond in ticket channels
  if (!message.channel.name.startsWith("ticket-")) return;

  // Send welcome message only on first message in ticket
  try {
    const recentMessages = await message.channel.messages.fetch({ limit: 50 });
    const alreadyWelcomed = recentMessages.some(
      (m) =>
        m.author.id === client.user.id &&
        m.content.includes("Welcome to animac TCG")
    );

    if (!alreadyWelcomed) {
      await message.channel.send(WELCOME_MESSAGE);
    }
  } catch (err) {
    console.error("Error checking welcome:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
