const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Collection}=require('discord.js');
const {buildOrderEmbed,recoverMessage}=require('./order-notifications');
const order={id:'order-id',order_number:'ANIMAC-001',currency:'JPY',status:'受注',customer:{name:'Test Customer'},billing_address:'MUST NOT LEAK',shipping_phone:'MUST NOT LEAK',created_at:'2026-09-07T00:00:00Z',shipping_fee:500,discount:0,handling_fee:0,total_amount:2500,payment_confirmed_at:null,order_items:[{product_name_en:'Box',quantity:2,unit_price:1000}]};
test('unpaid registered order has truthful state, total, detail link and no address data',()=>{
 const e=buildOrderEmbed(order,'https://animac.intl.shipord.jp',{id:'ticket'}).toJSON();
 assert.equal(e.url,'https://animac.intl.shipord.jp/orders/order-id');
 assert.equal(e.fields.find(f=>f.name==='入金').value,'未確認');
 assert.equal(e.fields.find(f=>f.name==='合計').value,'2,500 JPY');
 assert.ok(e.description.includes('× 2'));
 assert.ok(!JSON.stringify(e).includes('MUST NOT LEAK'));
 const paid=buildOrderEmbed({...order,payment_confirmed_at:'2026-09-07T01:00:00Z'},'https://animac.intl.shipord.jp').toJSON();
 assert.equal(paid.fields.find(f=>f.name==='入金').value,'入金済');
});
test('large orders stay within Discord embed size limits',()=>{
 const e=buildOrderEmbed({...order,order_items:Array.from({length:200},()=>({product_name_en:'A'.repeat(200),quantity:1,unit_price:1}))},'https://animac.intl.shipord.jp').toJSON();
 assert.ok(e.description.length<=4096);
 assert.ok(e.title.length+e.description.length+e.footer.text.length+e.fields.reduce((s,f)=>s+f.name.length+f.value.length,0)<6000);
});
test('a sent message is recovered after database acknowledgment failure',async()=>{
 const message={id:'message',author:{id:'bot'},embeds:[{footer:{text:'ANIMAC order order-id'}}],createdTimestamp:Date.now()};
 const thread={messages:{fetch:async()=>new Collection([['message',message]])}};
 assert.equal(await recoverMessage(thread,{order_id:'order-id',created_at:order.created_at},'bot'),message);
 assert.equal(await recoverMessage(thread,{order_id:'other',created_at:order.created_at},'bot'),null);
});
