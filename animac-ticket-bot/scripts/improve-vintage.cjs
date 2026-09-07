require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const {REST,Routes}=require('discord.js');const cfg=require('../vintage-server.json');
(async()=>{const r=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);const g=cfg.guildId;
if(g!=='1546607425069518909')throw Error('Wrong guild');
const me=await r.get(Routes.user('@me'));const channels=await r.get(Routes.guildChannels(g));
const order=['🌟 START HERE','🎴 VINTAGE & SINGLES','🎫 Support','⭐ VIP Customers','📁 Past Conversations','💬 COMMUNITY','💬 LOUNGE','🔊 VOICE','🔒 STAFF ONLY'];
const positions=order.map((name,position)=>({id:channels.find(c=>c.type===4&&c.name===name)?.id,position}));
if(positions.some(x=>!x.id))throw Error('Missing category');
await r.patch(Routes.guildChannels(g),{body:positions});
async function publish(id,title,content,components){
const rows=await r.get(Routes.channelMessages(id),{query:new URLSearchParams({limit:'100'})});const m=rows.find(x=>x.author.id===me.id&&x.content.startsWith(title));
const body={content,allowed_mentions:{parse:[]},...(components?{components}:{})};
if(m)await r.patch(Routes.channelMessage(id,m.id),{body});else await r.post(Routes.channelMessages(id),{body});}
for(const name of ['vintage-cards','single-cards','graded-cards']){
const title='**Listing Guide**';await publish(cfg.channels[name],title,`${title}\nListings include the card name and number, language, price in JPY, availability and clear photos. Raw cards include front/back photos and close-ups of visible flaws. Graded cards include the grading company, grade and certification number.\n\n**AVAILABLE**: ask our team to confirm availability. **RESERVED**: on hold. **SOLD**: no longer available.\n\nOpen <#${cfg.channels['open-a-ticket']}> with the listing link or item reference to ask about a card. Additional photos can be requested in your private ticket. These are listing instructions, not an offer for a specific card.`);}
await publish(cfg.channels['how-to-buy'],'**How to buy**',`**How to buy**\n1. Browse <#${cfg.channels['vintage-cards']}>, <#${cfg.channels['single-cards']}> or <#${cfg.channels['graded-cards']}>.\n2. Open <#${cfg.channels['open-a-ticket']}> and send the listing link/item reference and quantity.\n3. Our team will confirm availability, condition photos, price and shipping before payment.\n4. Follow the payment instructions provided by our staff in your ticket.\n\n**Condition & photos**\nReview front, back and close-up photos. Ask about scratches, whitening, dents, creases and any other details that matter to you. Condition labels are a summary; request extra photos if anything is unclear. Raw-card condition does not guarantee a future grading result.\n\n**Availability**\nAVAILABLE: ask our team to confirm availability.\nRESERVED: currently on hold.\nSOLD: no longer available.\n\nKeep addresses and payment information in your private ticket.`);
await publish(cfg.channels['inventory-notes'],'**商品掲載テンプレート（スタッフ用）**','**商品掲載テンプレート（スタッフ用）**\n実物と在庫情報を確認して以下を埋め、写真と一緒に商品チャンネルへ掲載してください。空欄や架空の数値で公開しないでください。\n```\nItem reference: [個体別の商品番号]\nCard / Set / Card number: [名称・セット・番号]\nLanguage: [言語]\nCondition: [キズ・白欠け・凹み・折れ等を具体的に]\nGrading company / Grade / Cert number: [鑑定品のみ]\nPrice: [金額] JPY\nQuantity: [在庫数]\nAvailability: AVAILABLE / RESERVED / SOLD\nPhotos: front / back / close-ups of flaws\n```\nNM等の略称だけで説明を済ませず、写真と具体的な状態説明を付けてください。同じカードでも状態が違う個体は番号を分けます。売約・販売済みは元投稿のAvailabilityと数量を更新してください。');
await publish(cfg.channels['order-management'],'**Vintage／Single 注文登録**','**Vintage／Single 注文登録**\n下のボタンから登録すると注文元がANIMAC Vintage & Singlesに選択されます。保存前に選択を確認してください。\n入力済＝受注登録完了／入金済＝入金確認完了。\n未完了注文のあるチケット、または顧客と未紐づけのチケットは自動移動しません。/confirm で既存顧客を選ぶと紐づけられます。',[{type:1,components:[{type:2,style:5,label:'Vintage / Single 注文登録',url:'https://animac.intl.shipord.jp/orders/new?ch=dc&server=vintage'}]}]);
await publish('1546607425069518912','**Chat has moved**',`**Chat has moved**\nPlease use <#${cfg.channels['general-chat']}> for conversation so everyone can follow in one place. Previous messages remain available here.`);
for(const ch of channels.filter(c=>c.type===0&&c.name.startsWith('ticket-'))){
const rows=await r.get(Routes.channelMessages(ch.id),{query:new URLSearchParams({limit:'100'})});
for(const m of rows.filter(m=>m.author.id===me.id)){
if(m.content.startsWith('Hey 👋 Welcome to animac TCG!'))await r.patch(Routes.channelMessage(ch.id,m.id),{body:{content:'Welcome to ANIMAC Vintage & Singles! 🇯🇵\n\nPlease share the card name, set/card number, language, preferred condition or grade, and quantity. A listing link or reference photo is welcome. Let us know your shipping country so our team can confirm availability, condition photos, price and shipping.',embeds:[],allowed_mentions:{parse:[]}}});
if(m.embeds?.some(e=>e.title==='🎴 animac TCG Support'))await r.patch(Routes.channelMessage(ch.id,m.id),{body:{embeds:m.embeds.map(e=>({title:'🎴 ANIMAC Vintage & Singles Support',description:e.description,color:e.color,footer:{text:'ANIMAC Vintage & Singles — Shipped from Japan 🇯🇵'}})),allowed_mentions:{parse:[]}}});
}}
console.log('Category order, guides, listing template, order link and legacy onboarding updated. No access removed or categories deleted.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
