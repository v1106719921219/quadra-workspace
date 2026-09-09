const { ChannelType, PermissionFlagsBits } = require('discord.js');
const ACTIVE = '🎫 Support';
const CLOSED = '📁 Past Conversations';
const VIP = '⭐ VIP Customers';
const LEGACY_NAMES = new Map([['🎫 In Progress', ACTIVE], ['📁 Closed', CLOSED], ['🎫 対応中', ACTIVE], ['📁 対応済み', CLOSED], ['⭐ VIP・常連', VIP]]);
const normalizeName = name => {
  for (const [oldName, newName] of LEGACY_NAMES) {
    if (name === oldName || (name?.startsWith(oldName + ' ') && /^\d+$/.test(name.slice(oldName.length + 1)))) return newName + name.slice(oldName.length);
  }
  return name;
};
const CLOSED_MARKER = /\n?\[ticket-closed-at:(\d+)\]/g;
const closedAt = channel => Number(/\[ticket-closed-at:(\d+)\]/.exec(channel.topic || '')?.[1] || 0);
const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const isTicket = ch => ch && ch.type === ChannelType.GuildText && ch.name.startsWith('ticket-');
const belongs = (name, base) => {
  name = normalizeName(name);
  return name === base || (name?.startsWith(base + ' ') && /^\d+$/.test(name.slice(base.length + 1)));
};

function createTicketLifecycle(client, shouldKeepOpen = async () => false) {
  // Serialize category allocation and moves, including timer/message races.
  let queue = Promise.resolve();
  const serial = fn => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  const isVIP = channel => belongs(channel?.parent?.name, VIP);
  const destination = ({channel, closed, vip}) => (vip === true || (vip !== false && isVIP(channel))) ? VIP : closed ? CLOSED : ACTIVE;
  async function ensureVIP(guild) {
    const channels = await guild.channels.fetch();
    if (channels.some(ch => ch?.type === ChannelType.GuildCategory && ch.name === VIP)) return;
    const staff = guild.roles?.cache.find(r => r.name === 'スタッフ');
    await guild.channels.create({name: VIP, type: ChannelType.GuildCategory, position: 0,
      permissionOverwrites: [
        {id: guild.id, deny: [PermissionFlagsBits.ViewChannel]},
        {id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]},
        ...(staff ? [{id: staff.id, allow: [PermissionFlagsBits.ViewChannel]}] : []),
      ],
    });
    console.log('VIP customer category ready');
  }
  async function moveMany(entries) {
    if (!entries.length) return;
    const guild = entries[0].channel.guild;
    const channels = await guild.channels.fetch();
    // Decide from Discord's current parent, not a possibly stale gateway cache.
    const needed = entries.map(entry => ({...entry, channel: channels.get(entry.channel.id) || entry.channel}))
      .filter(entry => !belongs(entry.channel.parent?.name, destination(entry)));
    if (!needed.length) return;
    const counts = new Map();
    for (const ch of channels.values()) if (ch?.parentId) counts.set(ch.parentId, (counts.get(ch.parentId) || 0) + 1);
    const moves = [];
    for (const entry of needed) {
      const {channel} = entry;
      const base = destination(entry);
      let category = channels.find(ch => ch?.type === ChannelType.GuildCategory && belongs(ch.name, base) && (counts.get(ch.id) || 0) < 50);
      if (!category) {
        let name = base;
        for (let n = 2; channels.some(ch => ch?.name === name); n++) name = `${base} ${n}`;
        category = await guild.channels.create({name, type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {id: guild.id, deny: [PermissionFlagsBits.ViewChannel]},
            {id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]},
          ],
        });
        channels.set(category.id, category);
      }
      counts.set(category.id, (counts.get(category.id) || 0) + 1);
      moves.push({channel: channel.id, parent: category.id, lockPermissions: false});
    }
    // Use the channel update response and verify the parent with a fresh read.
    for (const entry of moves) {
      await channels.get(entry.channel).setParent(entry.parent, {lockPermissions: false});
      const verified = await guild.channels.fetch(entry.channel, {force: true});
      if (verified.parentId !== entry.parent) throw Error(`Ticket move not applied: ${entry.channel}`);
    }
    console.log(`Ticket lifecycle: moved ${moves.length} channels`);
  }
  const keepOpen = async channel => {
    try { return await shouldKeepOpen(channel); }
    catch(err) { console.error(`Ticket order check failed: ${channel.id}`,err.message); return true; }
  };
  const move = async (channel, closed) => {
    if(closed && await keepOpen(channel)) throw Error('Ticket requires order review before archiving');
    return moveMany([{channel, closed}]);
  };
  async function sweep() {
    for (const guild of client.guilds.cache.values()) {
      const channels = [...(await guild.channels.fetch()).values()].filter(ch => isTicket(ch) && !isVIP(ch));
      for (let i = 0; i < channels.length; i += 10) {
        const batch = channels.slice(i, i + 10);
        const entries = await Promise.all(batch.map(async channel => {
          try {
            const history = await channel.messages.fetch({limit: closedAt(channel) ? 100 : 1});
            const latest = history.first();
            const human = history.find(m => !m.author?.bot);
            return {channel, lastActivity: latest?.createdTimestamp ?? channel.createdTimestamp, humanActivity: human?.createdTimestamp || 0};
          } catch (err) {
            console.error(`Ticket lifecycle failed: ${channel.id}`, err.message);
            return null;
          }
        }));
        await serial(async () => {
          const moves = await Promise.all(entries.filter(Boolean).map(async ({channel, lastActivity, humanActivity}) => {
            // Include any message that arrived while history requests were in flight.
            const cachedTime = channel.lastMessageId ? Number((BigInt(channel.lastMessageId) >> 22n) + 1420070400000n) : 0;
            if (belongs(channel.parent?.name, CLOSED) && closedAt(channel) && humanActivity <= closedAt(channel)) return {channel, closed: true};
            return {channel, closed: Date.now() - Math.max(lastActivity, cachedTime) >= IDLE_MS && !(await keepOpen(channel))};
          }));
          await moveMany(moves);
        });
      }
    }
  }
  let timer;
  let sweeping = false;
  async function run() {
    if (sweeping) return;
    sweeping = true;
    try { await sweep(); } catch (err) { console.error('Ticket sweep failed:', err.message); }
    finally { sweeping = false; }
  }
  return {
    isVIP,
    setVIP: (channel, enabled) => serial(async () => {
      if (!isTicket(channel)) throw new Error('Not a ticket');
      let closed = false;
      if (!enabled) {
        const latest = (await channel.messages.fetch({limit: 1})).first();
        closed = Date.now() - (latest?.createdTimestamp ?? channel.createdTimestamp) >= IDLE_MS && !(await keepOpen(channel));
      }
      await moveMany([{channel, closed, vip: enabled}]);
    }),
    activate: channel => isTicket(channel) ? serial(() => move(channel, false)) : Promise.resolve(),
    close: channel => isTicket(channel) ? serial(async () => {
      if (isVIP(channel)) return;
      if (await keepOpen(channel)) throw Error('Ticket requires order review before archiving');
      // Persist manual closure so recovery does not undo Close Ticket after a restart.
      const topic = (channel.topic || '').replace(CLOSED_MARKER, '');
      const marked = `${topic}\n[ticket-closed-at:${Date.now()}]`;
      if (marked.length > 1024) throw Error('Ticket topic has no room for closure state');
      await channel.setTopic(marked);
      await move(channel, true);
    }) : Promise.reject(new Error('Not a ticket')),
    start() {
      if (timer) return;
      void serial(async () => {
        for (const guild of client.guilds.cache.values()) {
          if (['1491756246456336554', '1546607425069518909'].includes(guild.id)) {
            const channels = await guild.channels.fetch();
            for (const channel of channels.values()) {
              if (channel?.type === ChannelType.GuildCategory && normalizeName(channel.name) !== channel.name) {
                await channel.setName(normalizeName(channel.name), 'Use English ticket category names');
              }
            }
            await ensureVIP(guild);
          }
        }
      }).catch(err => console.error('VIP category setup failed:', err.message)).then(run);
      timer = setInterval(run, 15 * 60 * 1000);
      timer.unref();
    },
    sweep: run,
  };
}
module.exports = { createTicketLifecycle, IDLE_MS };
