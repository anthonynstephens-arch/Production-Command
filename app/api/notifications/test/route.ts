import {getPortalSession} from '@/lib/auth';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
export async function POST(){
 const session=await getPortalSession();if(!session||session.mustChangePin)return Response.json({error:'Please sign in.'},{status:401});
 const db=getSupabaseAdmin();const {data:pref}=await db.from('marsh_notification_preferences').select('channel,chat').eq('user_id',session.userId).maybeSingle();
 if(!pref?.chat||pref.channel==='none')return Response.json({error:'Save your delivery choice with chat alerts enabled first.'},{status:400});
 const event=`test:${session.userId}:${Math.floor(Date.now()/60000)}`;
 const {error}=await db.rpc('enqueue_marsh_notification',{event_key:event,event_kind:'group_message',category:'chat',event_payload:{sender_name:'Production Command',message_preview:'Your notification connection is working.',title:'Production Command test',body:'Your notification connection is working.',target_url:'https://production-command-six.vercel.app/?chat=group'},target_user:session.userId,exclude_user:null});
 return error?Response.json({error:'Could not queue test notification.'},{status:500}):Response.json({ok:true,message:'Test queued for your saved channels. Allow about one minute. Email delivery also requires your Zap to be published.'});
}
