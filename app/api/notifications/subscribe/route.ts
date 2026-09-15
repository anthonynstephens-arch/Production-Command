import {getPortalSession} from '@/lib/auth';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {validPushEndpoint} from '@/lib/notifications';
export async function POST(request:Request){
 const session=await getPortalSession();if(!session || session.mustChangePin)return Response.json({error:'Please sign in.'},{status:401});
 const input=await request.json().catch(()=>({}));
 if(typeof input.endpoint!=='string'||input.endpoint.length>2048||!validPushEndpoint(input.endpoint)||!/^[-_a-zA-Z0-9]{87}$/.test(input.keys?.p256dh||'')||!/^[-_a-zA-Z0-9]{22}$/.test(input.keys?.auth||''))return Response.json({error:'Invalid or unsupported push subscription.'},{status:400});
 const db=getSupabaseAdmin();
 // A browser subscription belongs to its current signed-in account only.
 const {error}=await db.from('marsh_push_subscriptions').upsert({user_id:session.userId,endpoint:input.endpoint,subscription:{endpoint:input.endpoint,keys:input.keys}},{onConflict:'endpoint'});
 return error?Response.json({error:'Could not enable push on this device.'},{status:500}):Response.json({ok:true});
}
export async function DELETE(request:Request){
 const session=await getPortalSession();if(!session)return Response.json({error:'Please sign in.'},{status:401});
 const input=await request.json().catch(()=>({}));
 if(typeof input.endpoint!=='string')return Response.json({error:'Device not supplied.'},{status:400});
 const {error}=await getSupabaseAdmin().from('marsh_push_subscriptions').delete().eq('user_id',session.userId).eq('endpoint',input.endpoint);
 return error?Response.json({error:'Could not remove this device.'},{status:500}):Response.json({ok:true});
}
