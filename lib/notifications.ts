import webpush from 'web-push';
import {getSupabaseAdmin} from './supabase-admin';
import {getShipStationOrders} from './shipstation';
const origin='https://production-command-six.vercel.app';
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);
export async function notificationConfig(){const {data,error}=await getSupabaseAdmin().from('marsh_notification_config').select('key,value');if(error)throw new Error('Notification configuration unavailable');return Object.fromEntries(data.map(r=>[r.key,r.value])) as Record<string,string>;}
export function validPushEndpoint(endpoint:string){try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
async function scanSupplies(){
 const db=getSupabaseAdmin();const [stock,result]=await Promise.all([db.from('marsh_inventory').select('item_key,quantity').eq('account_slug','marsh-supply'),getShipStationOrders()]);
 if(stock.error||!result.connected)return;
 const levels=Object.fromEntries(stock.data.map(r=>[r.item_key,Number(r.quantity)]));const committed=result.orders.filter(o=>o.status==='pending').reduce((s,o)=>s+o.quantity,0);
 for(const [key,label,unit] of [['blank_mats','Blank coir mats','mats'],['shipping_boxes','Shipping boxes','boxes'],['thank_you_cards','Thank-you cards','cards'],['poly_bags','Poly bags','bags'],['packing_tape','Packing tape','mat uses'],['ink','Black ink','percent']]){
  if(levels[key]===undefined)continue;const threshold=key==='ink'?25:0;
  let available=key==='ink'?levels[key]:levels[key]-committed;
  if(key==='packing_tape'){if(levels.packing_tape_coverage===undefined||levels.packing_tape_usage===undefined)continue;available=levels[key]*Math.max(1,levels.packing_tape_coverage)-levels.packing_tape_usage-committed;}
  const quantity=Math.max(0,available);const {error}=await db.rpc('marsh_check_supply',{supply_key:key,low_now:quantity<=threshold,details:{supply_name:label,quantity,unit,threshold,title:`Low supply: ${label}`,body:`${quantity} ${unit} available${key==='ink'?'':' after pending orders'}.`,target_url:origin+'/#supplies'}});if(error)throw new Error('Supply alert check failed');
 }
}
export async function dispatchNotifications(){
 const db=getSupabaseAdmin(),config=await notificationConfig();const {data:locked,error:lockError}=await db.rpc('marsh_acquire_notification_worker');if(lockError)throw new Error('Worker unavailable');if(!locked)return {busy:true};
 try{
  const {error:balanceError}=await db.rpc('marsh_daily_balance');if(balanceError)throw new Error('Balance alert check failed');
  // Supply provider outages must not prevent chat delivery.
  try{await scanSupplies();}catch{console.error('Notification supply scan failed');}
  const {data:jobs,error}=await db.rpc('marsh_claim_notifications');if(error)throw new Error('Queue unavailable');
  const outcomes=await Promise.all((jobs||[]).map(async(job:{id:string;recipient_id:string;channel:string;device_id:string;event_type:string;event_id:string;deduplication_key:string;attempts:number;payload:Record<string,any>;created_at:string})=>{
   try{
    const [p,u]=await Promise.all([db.from('marsh_notification_preferences').select('*').eq('user_id',job.recipient_id).maybeSingle(),db.from('marsh_portal_users').select('active,must_change_pin').eq('id',job.recipient_id).maybeSingle()]);
    if(p.error||u.error)throw new Error('Could not recheck preferences');const pref=p.data,user=u.data;
    let eligible=Date.now()-new Date(job.created_at).getTime()<86400000&&user?.active&&!user.must_change_pin&&pref&&pref[job.payload.category]&&(pref.channel===job.channel||pref.channel==='both');
    if(job.event_type==='balance_due'){const {data:balance,error:be}=await db.rpc('marsh_notification_balance');if(be)throw new Error('Unable to confirm balance');if(Number(balance)<=0)eligible=false;job.payload.balance_amount=Number(balance);job.payload.balance_formatted=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(balance));job.payload.body=`${job.payload.balance_formatted} remains outstanding.`;}
    if(job.event_type==='supplies_low'){const [,key,episode]=job.event_id.split(':');const {data:condition,error:ce}=await db.from('marsh_notification_conditions').select('is_low,episode').eq('key',key).maybeSingle();if(ce)throw new Error('Could not confirm inventory alert');if(!condition?.is_low||condition.episode!==episode)eligible=false;}
    if(!eligible){await db.from('marsh_notification_queue').update({status:'skipped'}).eq('id',job.id);return 'skipped';}
	    if(job.channel==='email'){
	     if(!pref.email)throw new Error('Email address missing');const resendKey=process.env.RESEND_API_KEY,fromEmail=process.env.RESEND_FROM_EMAIL;
	     if(resendKey&&fromEmail){const title=String(job.payload.title||'Production Command alert'),body=String(job.payload.body||''),target=String(job.payload.target_url||origin);const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:fromEmail,to:[pref.email],subject:title,text:`${body}\n\nOpen Production Command: ${target}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;color:#17382d"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.55">${escapeHtml(body)}</p><a href="${escapeHtml(target)}" style="display:inline-block;margin-top:12px;padding:12px 18px;border-radius:8px;background:#176b52;color:#fff;text-decoration:none;font-weight:700">Open Production Command</a><p style="margin-top:28px;color:#64766f;font-size:12px">Detroit Decal &amp; Apparel · Production Command</p></div>`}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Resend returned ${response.status}`);}
	     else{const hook=config['email_hook_'+job.event_type];if(!hook){await db.from('marsh_notification_queue').update({status:'pending',attempts:Math.max(0,job.attempts-1),available_at:new Date(Date.now()+3600000).toISOString(),last_error:'Email delivery is not configured for this event'}).eq('id',job.id);return 'waiting';}const url=new URL(hook);if(url.origin!=='https://hooks.zapier.com')throw new Error('Invalid email webhook');const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...job.payload,recipient_email:pref.email,notification_preference:pref.channel}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`Email webhook returned ${response.status}`);}
    }else{
     const {data:device,error:de}=await db.from('marsh_push_subscriptions').select('*').eq('id',job.device_id).eq('user_id',job.recipient_id).maybeSingle();if(de)throw new Error('Could not check device');if(!device){await db.from('marsh_notification_queue').update({status:'skipped'}).eq('id',job.id);return 'skipped';}
     if(!validPushEndpoint(device.endpoint))throw new Error('Unsupported push endpoint');
     await webpush.sendNotification(device.subscription,JSON.stringify({title:job.payload.title,body:job.payload.body,url:job.payload.target_url,tag:job.deduplication_key}),{vapidDetails:{subject:'mailto:info@detroitdecalandapparel.com',publicKey:config.vapid_public,privateKey:config.vapid_private},TTL:3600,timeout:8000});
    }
    const {error:saved}=await db.from('marsh_notification_queue').update({status:'accepted',last_error:null}).eq('id',job.id);if(saved)throw new Error('Delivery accepted but status save failed');return 'accepted';
   }catch(cause){const code=(cause as {statusCode?:number}).statusCode;if(job.channel==='push'&&(code===404||code===410)){await db.from('marsh_push_subscriptions').delete().eq('id',job.device_id);return 'expired';}await db.from('marsh_notification_queue').update({status:job.attempts>=5?'failed':'pending',available_at:new Date(Date.now()+Math.min(3600,60*2**job.attempts)*1000).toISOString(),last_error:cause instanceof Error?cause.message.slice(0,180):'Delivery failed'}).eq('id',job.id);return 'retry';}
  }));return {processed:outcomes.length,accepted:outcomes.filter(v=>v==='accepted').length};
 }finally{await db.from('marsh_notification_worker_lock').update({until_at:new Date().toISOString()}).eq('id',1);}
}
