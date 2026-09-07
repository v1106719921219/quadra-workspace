const { EmbedBuilder, escapeMarkdown, PermissionFlagsBits } = require('discord.js');
const { randomUUID, createHash } = require('crypto');
const GUILD_ID = '1491756246456336554';
const THREAD_ID = '1502702479765147650';
const PARENT_ID = '1491967299505094716';
const VINTAGE_GUILD_ID = '1546607425069518909';
function destinationFor(guildId) {
  if (!guildId || guildId === GUILD_ID) return {guildId:GUILD_ID, channelId:THREAD_ID, parentId:PARENT_ID, thread:true};
  if (guildId === VINTAGE_GUILD_ID) return {guildId, channelId:'1546608249657233521', parentId:'1546608242971517019', thread:false};
  throw new Error('Unknown Discord order source');
}
const { linkedCustomerId } = require('./ticket-customers');
const TABLE = 'discord_order_notifications';
const footerFor = id => `ANIMAC order ${id}`;
const safe = value => escapeMarkdown(String(value || '—')).slice(0, 200);
function buildOrderEmbed(order, site, ticket) {
  const money = value => value == null ? '—' : `${Number(value).toLocaleString('en-US', {maximumFractionDigits: 2})} ${order.currency}`;
  const items = [...(order.order_items || [])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const lines = items.map(i=>`${safe(i.product_name_en)} × ${i.quantity}　単価 ${money(i.unit_price)}`);
  let description = lines.join('\n');
  if (description.length > 3500) description = description.slice(0, 3450)+'\n…全明細は注文画面をご確認ください。';
  const fields = [
    {name:'顧客',value:safe(order.customer?.name || order.billing_name || order.shipping_name),inline:true},
    {name:'注文状況',value:safe(order.status),inline:true},
    {name:'入金',value:order.payment_confirmed_at?'入金済':'未確認',inline:true},
    {name:'送料',value:money(order.shipping_fee),inline:true},
    {name:'値引き',value:money(order.discount),inline:true},
    {name:'手数料',value:money(order.handling_fee),inline:true},
    {name:'合計',value:money(order.total_amount),inline:true},
  ];
  if (ticket) fields.push({name:'お客様のチケット',value:`<#${ticket.id}>`,inline:false});
  return new EmbedBuilder().setColor(order.status==='キャンセル'?0x777777:order.payment_confirmed_at?0x388e3c:0x3498db)
    .setTitle(`注文登録済 #${order.order_number}`.slice(0,256)).setURL(`${site}/orders/${order.id}`)
    .setDescription(description || '明細は注文画面をご確認ください。').addFields(fields)
    .setFooter({text:footerFor(order.id)}).setTimestamp(new Date(order.created_at));
}
async function recoverMessage(thread, row, botId) {
  let before;
  for (;;) {
    const messages = await thread.messages.fetch({limit:100,...(before?{before}:{})});
    const found = messages.find(m=>m.author.id===botId && m.embeds.some(e=>e.footer?.text===footerFor(row.order_id)));
    if (found) return found;
    const oldest=messages.last();
    if (!oldest || messages.size<100 || oldest.createdTimestamp < Date.parse(row.created_at)-60000) return null;
    before=oldest.id;
  }
}
function createOrderNotifications(client, db, tenant, site) {
  let running=false, timer;
  const verified = new Set();
  async function getDestination(guildId) {
    const target = destinationFor(guildId);
    const channel = await client.channels.fetch(target.channelId);
    if (!channel || channel.guildId !== target.guildId || channel.parentId !== target.parentId || (target.thread ? !channel.isThread() : channel.type !== 0)) throw new Error("Unexpected order notification destination");
    const permissions=channel.permissionsFor(client.user);
    if(!permissions?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,target.thread?PermissionFlagsBits.SendMessagesInThreads:PermissionFlagsBits.SendMessages,PermissionFlagsBits.AddReactions])) throw new Error("Missing order destination permissions");
    if(!verified.has(target.guildId)) {
      await channel.guild.emojis.fetch();
      if(target.thread && (!channel.guild.emojis.cache.some(e=>e.name==="nyurokusumi") || !channel.guild.emojis.cache.some(e=>e.name==="nyukinsumi"))) throw new Error("Required order status emojis missing");
      console.log(`Order destination verified: ${target.guildId}`);
      verified.add(target.guildId);
    }
    if(target.thread && channel.archived) await channel.setArchived(false);
    return channel;
  }
  async function update(row, patch, extraVersion) {
    let query=db.from(TABLE).update(patch).eq('order_id',row.order_id).eq('tenant_id',tenant).eq('lease_token',row.lease_token);
    if (extraVersion) query=query.eq('version',row.version);
    const {error}=await query;
    if(error) throw error;
  }
  async function deliver(row) {
    const {data:order,error}=await db.from('orders').select('id,order_number,customer_id,status,channel,discord_guild_id,currency,billing_name,shipping_name,shipping_fee,discount,handling_fee,total_amount,payment_confirmed_at,created_at,customer:customers(name),order_items(product_name_en,quantity,unit_price,sort_order)').eq('tenant_id',tenant).eq('id',row.order_id).single();
    if(error)throw error;
    if(order.channel!=='dc' || (order.status==='キャンセル'&&!row.message_id)) {await update(row,{pending:false},true);return;}
    if(!order.order_items?.length) throw new Error('Order items not ready; retry later');
    const thread = await getDestination(order.discord_guild_id);
    let message;
    if(row.message_id) {
      try { message=await thread.messages.fetch(row.message_id); }
      catch(err) { if(err.code!==10008)throw err; }
    }
    if(!message && row.attempted_at) message=await recoverMessage(thread,row,client.user.id);
    const tickets=[...thread.guild.channels.cache.values()].filter(c=>c.name?.startsWith('ticket-') && order.customer_id && linkedCustomerId(c.topic)===order.customer_id);
    const payload={embeds:[buildOrderEmbed(order,site,tickets.length===1?tickets[0]:null)],allowedMentions:{parse:[]}};
    if(message) await message.edit(payload);
    else {
      await update(row,{attempted_at:new Date().toISOString()});
      message=await thread.send({...payload,nonce:createHash('sha256').update(order.id).digest('hex').slice(0,24),enforceNonce:true});
    }
    // Persist immediately; a reaction failure must never cause a second post.
    await update(row,{message_id:message.id});
    const input=thread.guild.emojis.cache.find(e=>e.name==='nyurokusumi')?.id || (thread.guildId===VINTAGE_GUILD_ID?'📝':null);
    const paid=thread.guild.emojis.cache.find(e=>e.name==='nyukinsumi')?.id || (thread.guildId===VINTAGE_GUILD_ID?'💰':null);
    if(!input||!paid)throw new Error('Required 入力済 / 入金済 emoji missing');
    await message.react(input);
    if(order.payment_confirmed_at) await message.react(paid);
    else {
      const reaction=message.reactions.cache.get(paid);
      if(reaction?.me)await reaction.users.remove(client.user.id);
    }
    await update(row,{pending:false,last_error:null},true);
    console.log(`Order notification synced: ${row.order_id}`);
  }
  async function run() {
    if(!db||running)return;
    running=true;
    try {
      const now=new Date().toISOString();
      const {data:rows,error}=await db.from(TABLE).select('*').eq('tenant_id',tenant).eq('pending',true).lte('available_after',now).or(`locked_until.is.null,locked_until.lt.${now}`).order('created_at').limit(20);
      if(error)throw error;
      if(!rows.length) {
        for(const guildId of [GUILD_ID,VINTAGE_GUILD_ID]) {
          if(!verified.has(guildId)) {
            try { await getDestination(guildId); } catch(err) { console.error(`Order destination setup failed: ${guildId}`,err.message); }
          }
        }
        return;
      }
      for(const candidate of rows) {
        const lease=randomUUID();
        const {data:row,error:claimError}=await db.from(TABLE).update({lease_token:lease,locked_until:new Date(Date.now()+10*60000).toISOString()})
          .eq('order_id',candidate.order_id).eq('tenant_id',tenant).eq('pending',true).eq('version',candidate.version)
          .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`).select().maybeSingle();
        if(claimError)throw claimError;
        if(!row)continue;
        try {await deliver(row);}
        catch(err){console.error(`Order notification failed: ${row.order_id}`,err.message);await update(row,{last_error:String(err.message).slice(0,500),available_after:new Date(Date.now()+120000).toISOString()});}
        finally {await update(row,{locked_until:null,lease_token:null});}
      }
    }catch(err){console.error('Order notification worker failed:',err.message);}
    finally{running=false;}
  }
  return {run,start(){if(timer)return;void run();timer=setInterval(run,30000);timer.unref();}};
}
module.exports={destinationFor,buildOrderEmbed,recoverMessage,createOrderNotifications};
