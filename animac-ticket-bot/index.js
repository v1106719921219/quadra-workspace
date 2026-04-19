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
  REST,
  Routes,
} = require("discord.js");
const Anthropic = require("@anthropic-ai/sdk").default;

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

// Track ticket counter per guild
const ticketCounters = new Map();

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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Register slash commands
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

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [shippingCommand.toJSON()],
    });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
});

// Handle interactions (slash commands + buttons)
client.on("interactionCreate", async (interaction) => {
  // Handle /shipping slash command
  if (interaction.isChatInputCommand() && interaction.commandName === "shipping") {
    // Check channel
    if (!interaction.channel.name.includes("moderator-only")) {
      await interaction.reply({
        content: "❌ This command can only be used in #moderator-only",
        flags: 64,
      });
      return;
    }

    // Check role
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const hasStaffRole = interaction.member.roles.cache.some(
      (r) => r.name === "管理者" || r.name === "スタッフ"
    );
    if (!isAdmin && !hasStaffRole) {
      await interaction.reply({ content: "❌ Permission denied", flags: 64 });
      return;
    }

    const region = interaction.options.getString("country");
    const weight = interaction.options.getNumber("weight");

    const results = lookupShipping(region, weight);

    if (results.length === 0) {
      await interaction.reply("❌ No shipping options available for this region/weight.");
      return;
    }

    results.sort((a, b) => a.price - b.price);

    const regionLabel = shippingData.regionLabels[region] || region;
    let response = `📦 **Shipping to ${regionLabel}** (${weight}kg)\n`;
    response += "━━━━━━━━━━━━━━━━━━━━━━\n";

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const tag = i === 0 ? " ⭐ **Best Price!**" : "";
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "📦";
      response += `\n${medal} **${r.carrier}**${tag}\n`;
      response += `💴 ¥${r.price.toLocaleString()}\n`;
    }

    response += "\n━━━━━━━━━━━━━━━━━━━━━━";
    response += "\n💡 手数料・燃油サーチャージ込み";

    await interaction.reply(response);
    return;
  }

  if (!interaction.isButton()) return;

  if (interaction.customId === "create_ticket") {
    const guild = interaction.guild;
    const member = interaction.member;

    const username = member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const channelName = `ticket-${username}`;

    // Check if user already has an open ticket
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
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: member.id, // ticket creator
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: client.user.id, // bot
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
      });

      // Send welcome embed in ticket channel
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

      await ticketChannel.send({ embeds: [embed], components: [closeButton] });

      await interaction.reply({
        content: `✅ Ticket created! → <#${ticketChannel.id}>`,
        flags: 64, // ephemeral
      });
    } catch (err) {
      console.error("Error creating ticket:", err);
      await interaction.reply({
        content: "❌ Failed to create ticket. Please try again.",
        flags: 64,
      });
    }
  }

  if (interaction.customId === "close_ticket") {
    await interaction.reply("🔒 This ticket will be closed in 5 seconds...");
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
      } catch (err) {
        console.error("Error closing ticket:", err);
      }
    }, 5000);
  }
});

// Load shipping rates
delete require.cache[require.resolve("./shipping-rates.json")];
const shippingData = require("./shipping-rates.json");

function lookupShipping(region, weightKg) {
  const results = [];

  for (const [carrierId, carrier] of Object.entries(shippingData.carriers)) {
    const regionIndex = carrier.regions.indexOf(region);
    if (regionIndex === -1) continue;

    const rateRow = carrier.rates.find((r) => weightKg <= r[0]);
    if (!rateRow) continue;

    const price = rateRow[regionIndex + 1]; // +1 because index 0 is weight
    if (price === null) continue;

    results.push({
      carrier: carrier.name,
      price,
    });
  }

  return results;
}

// Send ticket panel to #open-a-ticket on command
client.on("messageCreate", async (message) => {
  // Shipping command (staff/admin only, #moderator-only channel only)
  if (message.content.startsWith("!shipping")) {
    if (!message.channel.name.includes("moderator-only")) return;

    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
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
      await message.channel.send("❌ Invalid weight. Please enter a number in kg (e.g., `3.5`)");
      return;
    }

    if (weight > 20) {
      await message.channel.send("❌ Maximum weight is 20kg. Please contact us for larger shipments.");
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
      await message.channel.send("❌ No shipping options available for this region/weight.");
      return;
    }

    // Sort by price
    results.sort((a, b) => a.price - b.price);

    const regionLabel = shippingData.regionLabels[region] || region;
    let response = `📦 **Shipping to ${regionLabel}** (${weight}kg)\n`;
    response += "━━━━━━━━━━━━━━━━━━━━━━\n";

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const tag = i === 0 ? " ⭐ **Best Price!**" : "";
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "📦";
      response += `\n${medal} **${r.carrier}**${tag}\n`;
      response += `💴 ¥${r.price.toLocaleString()}\n`;
    }

    response += "\n━━━━━━━━━━━━━━━━━━━━━━";
    response += "\n💡 手数料・燃油サーチャージ込み";

    await message.channel.send(response);
    return;
  }

  // Panel setup command (admin only)
  if (message.content === "!setup-panel" && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
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

  // Only respond in ticket channels
  if (!message.channel.name.startsWith("ticket-")) return;

  // Send welcome message only on first message in ticket
  try {
    const recentMessages = await message.channel.messages.fetch({ limit: 50 });
    const alreadyWelcomed = recentMessages.some(
      (m) => m.author.id === client.user.id && m.content.includes("Welcome to animac TCG")
    );

    if (!alreadyWelcomed) {
      await message.channel.send(WELCOME_MESSAGE);
    }
  } catch (err) {
    console.error("Error checking welcome:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
