const {test}=require('node:test');const assert=require('node:assert/strict');
const {createTicketOrderGuard,isComplete}=require('./ticket-order-guard');
const channel={guild:{id:'1546607425069518909'},topic:'顧客情報: https://animac.intl.shipord.jp/customers/11111111-1111-4111-8111-111111111111\nDiscord: @test'};
function db(rows,error){const q={select(){return this},eq(){return this},in(){return this},or(){return this},order(){return this},async range(){return {data:rows,error}}};return {from:()=>q};}
test('unpaid and unshipped orders remain open; only paid shipped or cancelled complete',()=>{
 assert.equal(isComplete({status:'出荷完了',payment_confirmed_at:null}),false);
 assert.equal(isComplete({status:'出荷準備中',payment_confirmed_at:'now'}),false);
 assert.equal(isComplete({status:'出荷完了',payment_confirmed_at:'now'}),true);
 assert.equal(isComplete({status:'キャンセル'}),true);
});
test('unlinked tickets stay open and unrelated guilds retain existing policy',async()=>{
 const guard=createTicketOrderGuard(null,'tenant');assert.equal(await guard(channel),true);
 assert.equal(await guard({guild:{id:'original'}}),false);
 assert.equal(await createTicketOrderGuard(db([]),'tenant')({...channel,topic:''}),true);
});
test('linked tickets block on unfinished orders, release on completed ones, and propagate lookup failure',async()=>{
 assert.equal(await createTicketOrderGuard(db([{status:'受注'}]),'tenant')(channel),true);
 assert.equal(await createTicketOrderGuard(db([{status:'キャンセル'}]),'tenant')(channel),false);
 await assert.rejects(createTicketOrderGuard(db(null,Error('offline')),'tenant')(channel),/offline/);
});
