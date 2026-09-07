// Usage: node scripts/setup-vintage.cjs GUILD_ID [--apply]
// Creates new channels only. Existing channels and member role assignments are untouched.
require('dotenv').config({path: require('path').join(__dirname, '../.env')});
const {REST, Routes, PermissionFlagsBits:P, PermissionsBitField, ChannelType:T} = require('discord.js');
const fs = require('fs');
const path = require('path');
const ORIGINAL = '1491756246456336554';
const guildId = process.argv[2];
const apply = process.argv.includes('--apply');
const publicSections = [
  ['🌟 START HERE', ['rules','announcements','how-to-buy','open-a-ticket']],
  ['🎴 VINTAGE & SINGLES', ['vintage-cards','single-cards','graded-cards','new-arrivals','card-requests']],
  ['💬 COMMUNITY', ['general-chat','show-your-collection','delivery-reviews']],
];
const bits = (...values) => new PermissionsBitField(values).bitfield.toString();
const introductions = {
  'rules': '**Welcome to ANIMAC Vintage & Singles**\nPlease be respectful and keep posts relevant to collecting. No spam, impersonation or unsolicited sales messages. Never post payment details, addresses or other personal information in public channels. For purchases and order questions, please open a private ticket.',
  'how-to-buy': '**How to buy**\n1. Browse our vintage, single and graded card listings.\n2. Open a private ticket and send the listing link or card name, set and quantity.\n3. Our team will confirm availability, condition photos, price and shipping before payment.\n4. Follow the payment instructions provided by our staff in your ticket.\n\nPlease ask about any condition details before placing your order.',
  'card-requests': '**Looking for a specific card?**\nOpen a private ticket with the card name, set/card number, preferred language, condition or grade, and quantity. Reference photos are welcome. Our team will confirm whether we can source it.',
  'open-a-ticket': '**ANIMAC Vintage & Singles Support**\nFor availability, condition photos, shipping questions or an order, open a private ticket below. Only you and our team can see your conversation.',
};
(async()=>{
  if (!/^\d{17,20}$/.test(guildId||'') || guildId === ORIGINAL) throw Error('Supply the NEW server ID; original ANIMAC is protected.');
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  const [guild,me]=await Promise.all([rest.get(Routes.guild(guildId)),rest.get(Routes.user('@me'))]);
  if(guild.name!=='ANIMAC Vintage & Singles') throw Error('Unexpected server name; inspect before setup.');
  if(!apply){console.log(JSON.stringify({guildId,name:guild.name,sections:publicSections,privateCategories:['🎫 Support','📁 Past Conversations','⭐ VIP Customers','🔒 STAFF ONLY']},null,2));return;}
  const roles=await rest.get(Routes.guildRoles(guildId));
  let staff=roles.find(r=>r.name==='スタッフ');
  if(!staff) staff=await rest.post(Routes.guildRoles(guildId),{body:{name:'スタッフ',color:0x388e3c,hoist:true,mentionable:false,permissions:bits(P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.AttachFiles,P.EmbedLinks,P.AddReactions,P.UseApplicationCommands)}});
  const botAllow=bits(P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.ManageChannels,P.ManageMessages,P.EmbedLinks,P.AttachFiles,P.AddReactions,P.SendMessagesInThreads,P.CreatePrivateThreads,P.ManageThreads);
  const staffAllow=bits(P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.EmbedLinks,P.AttachFiles,P.AddReactions,P.SendMessagesInThreads);
  const overwrites=(mode)=>[
    {id:guildId,type:0,allow:mode==='private'?'0':bits(P.ViewChannel,P.ReadMessageHistory),deny:mode==='private'?bits(P.ViewChannel):mode==='read'?bits(P.SendMessages,P.CreatePublicThreads,P.CreatePrivateThreads,P.SendMessagesInThreads):'0'},
    {id:staff.id,type:0,allow:staffAllow,deny:'0'},
    {id:me.id,type:1,allow:botAllow,deny:'0'},
  ];
  const channels=await rest.get(Routes.guildChannels(guildId));
  async function ensure(name,type,parent,mode,position){
    const matches=channels.filter(c=>c.name===name&&c.type===type&&(!parent||c.parent_id===parent));
    if(matches.length>1)throw Error(`Ambiguous existing channel: ${name}`);
    if(matches[0])return matches[0];
    const ch=await rest.post(Routes.guildChannels(guildId),{body:{name,type,...(parent?{parent_id:parent}:{}),...(position===undefined?{}:{position}),permission_overwrites:overwrites(mode)}});
    channels.push(ch);return ch;
  }
  let position=0;const created={guildId,staffRoleId:staff.id,channels:{}};
  for(const [name,names] of publicSections){
    const mode=name.includes('COMMUNITY')?'chat':'read';
    const cat=await ensure(name,T.GuildCategory,null,mode,position++);
    for(const name of names){
      const ch=await ensure(name,T.GuildText,cat.id,mode);
      created.channels[name]=ch.id;
      const text=introductions[name];
      if(text){
        const messages=await rest.get(Routes.channelMessages(ch.id),{query:new URLSearchParams({limit:'100'})});
        if(!messages.some(m=>m.author.id===me.id&&m.content===text)){
          await rest.post(Routes.channelMessages(ch.id),{body:{content:text,allowed_mentions:{parse:[]},...(name==='open-a-ticket'?{components:[{type:1,components:[{type:2,style:1,label:'Open a Ticket',custom_id:'create_ticket'}]}]}:{})}});
        }
      }
    }
  }
  for(const name of ['🎫 Support','📁 Past Conversations','⭐ VIP Customers']) await ensure(name,T.GuildCategory,null,'private',position++);
  const internal=await ensure('🔒 STAFF ONLY',T.GuildCategory,null,'private',position++);
  for(const name of ['moderator-only','order-management','inventory-notes']) created.channels[name]=(await ensure(name,T.GuildText,internal.id,'private')).id;
  const out=path.join(__dirname,'../vintage-server.json');
  fs.writeFileSync(out,JSON.stringify(created,null,2)+'\n');
  console.log(JSON.stringify(created,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
