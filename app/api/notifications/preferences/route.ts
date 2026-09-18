import {getPortalSession} from '@/lib/auth';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {notificationConfig} from '@/lib/notifications';
export async function GET(){
 const session=await getPortalSession();if(!session || session.mustChangePin)return Response.json({error:'Please sign in.'},{status:401});
 const db=getSupabaseAdmin();
 const [{data,error},{data:user},config]=await Promise.all([db.from('marsh_notification_preferences').select('channel,email,chat,billing,supplies,shipping_issues').eq('user_id',session.userId).maybeSingle(),db.from('marsh_portal_users').select('email').eq('id',session.userId).single(),notificationConfig()]);
 if(error)return Response.json({error:'Could not load notification settings.'},{status:500});
 return Response.json({preferences:data,defaultEmail:user?.email || '',publicKey:config.vapid_public},{headers:{'Cache-Control':'no-store'}});
}
export async function PUT(request:Request){
 const session=await getPortalSession();if(!session || session.mustChangePin)return Response.json({error:'Please sign in.'},{status:401});
 const input=await request.json().catch(()=>({}));
 if(!['none','email','push','both'].includes(input.channel)||['chat','billing','supplies','shipping_issues'].some(k=>typeof input[k]!=='boolean'))return Response.json({error:'Choose your notification preferences.'},{status:400});
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(['email','both'].includes(input.channel)&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))return Response.json({error:'Enter a valid email address.'},{status:400});
 const {error}=await getSupabaseAdmin().from('marsh_notification_preferences').upsert({user_id:session.userId,channel:input.channel,email:email||null,chat:input.chat,billing:input.billing,supplies:input.supplies,shipping_issues:input.shipping_issues,updated_at:new Date().toISOString()});
 return error?Response.json({error:'Could not save notification settings.'},{status:500}):Response.json({ok:true});
}
