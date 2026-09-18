import {randomUUID} from 'crypto';
import {getPortalSession} from '@/lib/auth';
import {dispatchNotifications} from '@/lib/notifications';
import {getSupabaseAdmin} from '@/lib/supabase-admin';

const appOrigin='https://production-command-six.vercel.app';

export async function POST(request:Request){
 const session=await getPortalSession();
 if(session?.role!=='admin'||session.mustChangePin)return Response.json({error:'Admin access required.'},{status:403});
 const input=await request.json().catch(()=>({}));
 const title=typeof input.title==='string'?input.title.trim().slice(0,120):'';
 const body=typeof input.body==='string'?input.body.trim().slice(0,2000):'';
 let targetUrl=typeof input.targetUrl==='string'?input.targetUrl.trim():appOrigin;
 try{const parsed=new URL(targetUrl);if(parsed.origin!==appOrigin)targetUrl=appOrigin;}catch{targetUrl=appOrigin;}
 if(!title||!body)return Response.json({error:'Enter a subject and message.'},{status:400});
 const db=getSupabaseAdmin(),eventId=`broadcast:${randomUUID()}`;
 const {data:users,error}=await db.from('marsh_portal_users').select('id').eq('active',true).eq('must_change_pin',false);
 if(error)return Response.json({error:'Could not load portal users.'},{status:500});
 const ids=(users??[]).map(user=>user.id);
 if(!ids.length)return Response.json({error:'No active users are ready for notifications.'},{status:400});
 const [{data:preferences,error:preferencesError},{data:devices,error:devicesError}]=await Promise.all([
  db.from('marsh_notification_preferences').select('user_id,email,channel').in('user_id',ids),
  db.from('marsh_push_subscriptions').select('id,user_id').in('user_id',ids)
 ]);
 if(preferencesError||devicesError)return Response.json({error:'Could not prepare notification recipients.'},{status:500});
 const payloadBase={event_id:eventId,event_type:'admin_broadcast',occurred_at:new Date().toISOString(),sender_name:session.name,title,body,target_url:targetUrl,category:'broadcast',category_enabled:true};
 const rows:Array<Record<string,unknown>>=[];
 for(const pref of preferences??[]){
  if(pref.email)rows.push({event_id:eventId,event_type:'admin_broadcast',recipient_id:pref.user_id,channel:'email',payload:{...payloadBase,recipient_email:pref.email},deduplication_key:`${eventId}:${pref.user_id}:email`});
  if(pref.channel==='push'||pref.channel==='both')for(const device of (devices??[]).filter(item=>item.user_id===pref.user_id))rows.push({event_id:eventId,event_type:'admin_broadcast',recipient_id:pref.user_id,channel:'push',device_id:device.id,payload:payloadBase,deduplication_key:`${eventId}:${pref.user_id}:push:${device.id}`});
 }
 if(!rows.length)return Response.json({error:'No users have a saved email address or enabled push device.'},{status:400});
 const {error:queueError}=await db.from('marsh_notification_queue').insert(rows);
 if(queueError)return Response.json({error:'Could not queue the notification.'},{status:500});
 await dispatchNotifications().catch(error=>console.error('[notifications/broadcast] dispatch failed',error));
 const emailCount=rows.filter(row=>row.channel==='email').length,pushCount=rows.filter(row=>row.channel==='push').length;
 return Response.json({ok:true,message:`Notification queued for ${emailCount} email recipient${emailCount===1?'':'s'} and ${pushCount} push device${pushCount===1?'':'s'}.`});
}
