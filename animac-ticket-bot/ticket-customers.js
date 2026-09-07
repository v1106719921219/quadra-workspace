const { ChannelType, PermissionFlagsBits } = require('discord.js');
const MARKER = /(?:\[animac-customer:|顧客情報: https:\/\/animac\.intl\.shipord\.jp\/customers\/)([0-9a-f-]{36})(?:;account:|\nDiscord: @)([a-z0-9-]*)\]?/;
const accountSlug = value => String(value || '').trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9-]/g, '');
const isTicket = channel => channel?.type === ChannelType.GuildText && channel.name.startsWith('ticket-');
function ticketName(customer, original) {
  const name = customer.name.normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const suffix = original.slice(0, 40);
  return `ticket-${name.slice(0, 90 - suffix.length)}${suffix ? '-' + suffix : ''}`.slice(0, 100);
}
function resolveCustomer(channel, customers, channels) {
  const marker = (channel.topic || '').match(MARKER);
  if (marker) return customers.find(c => c.id === marker[1]);
  const slug = channel.name.slice(7);
  const matches = customers.filter(c => accountSlug(c.account_name) && accountSlug(c.account_name) === slug);
  // Both sides must be unique. No fuzzy matching of customer names.
  if (matches.length !== 1 || channels.filter(c => isTicket(c) && c.name === channel.name).length !== 1) return;
  return matches[0];
}
function belongsToUser(channel, userId, botId) {
  if (!isTicket(channel) || userId === botId) return false;
  const overwrite = channel.permissionOverwrites.cache.get(userId);
  return overwrite?.type === 1 && overwrite.allow.has(PermissionFlagsBits.ViewChannel);
}
function createTicketCustomers(client, db, tenant) {
  let running = false;
  let timer;
  const locks = new Map();
  async function bind(channel, customer) {
    if (!isTicket(channel) || !customer?.id || !customer.name?.trim()) return;
    const previous = locks.get(channel.id) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const old = channel.topic || '';
      const original = old.match(MARKER)?.[2] ?? accountSlug(channel.name.slice(7));
      const tag = `顧客情報: https://animac.intl.shipord.jp/customers/${customer.id}\nDiscord: @${original}`;
      const topic = old.match(MARKER) ? old.replace(MARKER, tag) : `${old}${old ? '\n' : ''}${tag}`;
      if (topic.length > 1024) throw new Error('Ticket topic has no room for customer identity');
      const name = ticketName(customer, original);
      if (channel.name === name && old === topic) return;
      await channel.edit({ name, topic, reason: 'Display linked ANIMAC customer name' });
      console.log(`Ticket customer linked: ${channel.id} customer=${customer.id}`);
    });
    locks.set(channel.id, task);
    try { await task; } finally { if (locks.get(channel.id) === task) locks.delete(channel.id); }
  }
  async function sync() {
    if (!db || running) return;
    running = true;
    try {
      const customers = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from('customers').select('id,name,account_name,channel').eq('tenant_id', tenant).order('id').range(offset, offset + 499);
        if (error) throw error;
        customers.push(...data);
        if (data.length < 500) break;
      }
      let linked = 0;
      for (const guild of client.guilds.cache.values()) {
        const channels = [...(await guild.channels.fetch()).values()];
        for (const channel of channels) {
          if (!isTicket(channel)) continue;
          const hasMarker = MARKER.test(channel.topic || '');
          const customer = resolveCustomer(channel, guild.id === '1546607425069518909' ? customers.filter(c => c.channel === 'sv') : (hasMarker ? customers.filter(c => c.channel !== 'sv') : customers.filter(c => c.channel === 'dc')), channels);
          if (!customer) continue;
          try { await bind(channel, customer); linked++; }
          catch (err) { console.error(`Ticket customer sync failed: ${channel.id}`, err.message); }
        }
      }
      console.log(`Ticket customer sync complete: ${linked} matched`);
    } catch (err) { console.error('Ticket customer sync failed:', err.message); }
    finally { running = false; }
  }
  return { bind, sync, start() { if (timer) return; void sync(); timer = setInterval(sync, 15 * 60 * 1000); timer.unref(); } };
}
module.exports = { linkedCustomerId: topic => (topic || '').match(MARKER)?.[1], accountSlug, ticketName, resolveCustomer, belongsToUser, createTicketCustomers };
