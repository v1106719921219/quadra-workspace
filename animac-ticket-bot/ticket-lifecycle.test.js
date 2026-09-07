const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ChannelType } = require('discord.js');
const { createTicketLifecycle, IDLE_MS } = require('./ticket-lifecycle');
function fixture() {
  const channels = new Collection();
  const guild = { id: 'guild', channels: { setPositions: async moves => { assert.equal(moves.length, 1, "Discord permits one parent change per request"); for (const move of moves) { assert.equal(move.lockPermissions, false); channels.get(move.channel).parentId = move.parent; } }, fetch: async () => channels, create: async data => {
    const category = { ...data, id: `cat-${channels.size}` };
    channels.set(category.id, category); return category;
  } } };
  function ticket(id, age, fail = false) {
    const ch = { id, name: `ticket-${id}`, guild, type: ChannelType.GuildText, parentId: null,
      get parent() { return channels.get(this.parentId); },
      createdTimestamp: Date.now() - age,
      messages: { fetch: async () => { if (fail) throw Error('no access'); return new Collection([['m', { createdTimestamp: Date.now() - age }]]); } },
      async setParent(id, options) { assert.equal(options.lockPermissions, false); this.parentId = id; },
    }; channels.set(id, ch); return ch;
  }
  return { channels, ticket, lifecycle: createTicketLifecycle({ user: { id: 'bot' }, guilds: { cache: new Collection([['guild', guild]]) } }) };
}
test('archives inactive tickets, keeps recent ones active, and preserves inaccessible channels', async () => {
  const f = fixture();
  const old = f.ticket('old', IDLE_MS + 1000);
  const recent = f.ticket('recent', 1000);
  const unknown = f.ticket('unknown', IDLE_MS * 2, true);
  await f.lifecycle.sweep();
  assert.equal(old.parent.name, '📁 Past Conversations');
  assert.equal(recent.parent.name, '🎫 Support');
  assert.equal(unknown.parentId, null);
  await f.lifecycle.activate(old);
  assert.equal(old.parent.name, '🎫 Support');
  await f.lifecycle.close(old);
  assert.equal(old.parent.name, '📁 Past Conversations');
});
test('allocates overflow categories and serializes simultaneous reopens', async () => {
  const f = fixture();
  const tickets = Array.from({ length: 51 }, (_, i) => f.ticket(String(i), 0));
  await Promise.all(tickets.map(t => f.lifecycle.activate(t)));
  const categories = f.channels.filter(c => c.type === ChannelType.GuildCategory);
  assert.equal(categories.size, 2);
  for (const c of categories.values()) assert.ok(tickets.filter(t => t.parentId === c.id).length <= 50);
});
test('batched history checks with individual moves respect 50-channel category capacity', async () => {
  const f=fixture();
  const tickets=Array.from({length:56},(_,i)=>f.ticket(`old-${i}`,IDLE_MS+1000));
  await f.lifecycle.sweep();
  const categories=f.channels.filter(c=>c.type===ChannelType.GuildCategory);
  assert.equal(categories.size,2);
  for(const c of categories.values())assert.ok(tickets.filter(t=>t.parentId===c.id).length<=50);
  assert.ok(tickets.every(t=>t.parent.name.startsWith('📁 Past Conversations')));
});
test('staff-designated VIP stays in its category across inactivity, messages and close; removal restores normal lifecycle', async () => {
  const f=fixture();
  const old=f.ticket('vip',IDLE_MS*2);
  await f.lifecycle.setVIP(old,true);
  assert.equal(old.parent.name,'⭐ VIP Customers');
  await f.lifecycle.sweep();
  await f.lifecycle.activate(old);
  await f.lifecycle.close(old);
  assert.equal(old.parent.name,'⭐ VIP Customers');
  await f.lifecycle.setVIP(old,false);
  assert.equal(old.parent.name,'📁 Past Conversations');
  const recent=f.ticket('recent-vip',1000);
  await f.lifecycle.setVIP(recent,true);
  await f.lifecycle.setVIP(recent,false);
  assert.equal(recent.parent.name,'🎫 Support');
});
