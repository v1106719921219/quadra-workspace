const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const {resolveCustomer, ticketName, belongsToUser, createTicketCustomers} = require('./ticket-customers');
const customer = {id:'11111111-1111-4111-8111-111111111111',name:'Test Buyer',account_name:'TestBuyer123'};
test('unique account match only; ambiguous customers and channels are left alone',()=>{
 const ch={type:0,name:'ticket-testbuyer123'};
 assert.equal(resolveCustomer(ch,[customer],[ch]),customer);
 assert.equal(resolveCustomer(ch,[customer,{...customer,id:'other'}],[ch]),undefined);
 assert.equal(resolveCustomer(ch,[customer],[ch,{...ch}]),undefined);
 assert.equal(resolveCustomer({...ch,name:'ticket-testbuyyer123'},[customer],[ch]),undefined);
});
test('renamed ticket stays linked even after account name changes',()=>{
 const ch={type:0,name:'ticket-test-buyer-testbuyer123',topic:`[animac-customer:${customer.id};account:testbuyer123]`};
 assert.equal(resolveCustomer(ch,[{...customer,account_name:'changed'}],[ch]).id,customer.id);
 assert.equal(ticketName(customer,'testbuyer123'),'ticket-test-buyer-testbuyer123');
 assert.ok(ticketName({...customer,name:'A'.repeat(200)},'b'.repeat(100)).length<=100);
});
test('duplicate detection uses private member access after rename',()=>{
 const ch={type:0,name:'ticket-test-buyer-testbuyer123',permissionOverwrites:{cache:new Collection([['owner',{type:1,allow:new PermissionsBitField(PermissionFlagsBits.ViewChannel)}]])}};
 assert.equal(belongsToUser(ch,'owner','bot'),true);
 assert.ok(!belongsToUser(ch,'someone-else','bot'));
 assert.equal(belongsToUser(ch,'bot','bot'),false);
});
test('bind preserves existing topic and avoids repeat writes',async()=>{
 let writes=0;
 const ch={id:'ch',type:0,name:'ticket-testbuyer123',topic:'Existing note',async edit(patch){writes++;assert.equal(patch.permissionOverwrites,undefined);Object.assign(this,patch);}};
 const service=createTicketCustomers({},null,'tenant');
 await service.bind(ch,customer);
 await service.bind(ch,customer);
 assert.equal(writes,1);
 assert.ok(ch.topic.startsWith('Existing note\n'));
 assert.equal(resolveCustomer(ch,[customer],[ch]),customer);
});
