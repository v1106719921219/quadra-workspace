const {linkedCustomerId}=require('./ticket-customers');
const VINTAGE='1546607425069518909';
const isComplete=order=>order.status==='キャンセル'||(order.status==='出荷完了'&&!!order.payment_confirmed_at);
function createTicketOrderGuard(db,tenant){
  return async channel=>{
    if(channel.guild.id!==VINTAGE)return false;
    if(!db)return true;
    const customer=linkedCustomerId(channel.topic);
    // Unlinked tickets cannot safely be matched to pending orders.
    if(!customer)return true;
    for(let offset=0;;offset+=500){
      const {data,error}=await db.from('orders').select('id,status,payment_confirmed_at')
        .eq('tenant_id',tenant).in('channel',['dc','sv']).eq('discord_guild_id',VINTAGE)
        .or(`customer_id.eq.${customer},customer_id.is.null`).order('id').range(offset,offset+499);
      if(error)throw error;
      if(!Array.isArray(data))throw Error('Order state unavailable');
      if(data.some(order=>!isComplete(order)))return true;
      if(data.length<500)return false;
    }
  };
}
module.exports={createTicketOrderGuard,isComplete};
