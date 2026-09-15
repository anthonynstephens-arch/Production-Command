import {timingSafeEqual} from 'crypto';
import {dispatchNotifications,notificationConfig} from '@/lib/notifications';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 const config=await notificationConfig();
 const given=request.headers.get('authorization') || '',expected=`Bearer ${config.worker_secret}`;
 if(!config.worker_secret || given.length!==expected.length || !timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await dispatchNotifications());}catch{return Response.json({error:'Notification processing failed'},{status:500});}
}
