import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = "id,sender_id,recipient_id,body,created_at,read_at";
export async function GET(request: Request) {
  const session = await getPortalSession();
  if (!session || session.mustChangePin) return Response.json({error:"Please sign in to use messages."},{status:401});
  const db = getSupabaseAdmin();
  const params = new URL(request.url).searchParams;
  const peer = params.get("user");
  if (!peer) {
    const {data: users,error} = await db.from("marsh_portal_users").select("id,display_name,active").neq("id",session.userId).order("display_name");
    if (error) return Response.json({error:"Could not load contacts."},{status:500});
    const contacts = await Promise.all(users.map(async user => {
      const {count,error: countError} = await db.from("marsh_messages").select("id",{count:"exact",head:true}).eq("recipient_id",session.userId).eq("sender_id",user.id).is("read_at",null);
      if(countError) throw countError;
      return {...user,unread:count || 0};
    })).catch(()=>null);
    return contacts ? Response.json({contacts},{headers:{"Cache-Control":"no-store"}}) : Response.json({error:"Could not load messages."},{status:500});
  }
  if (!uuid.test(peer)) return Response.json({error:"Invalid contact."},{status:400});
  let query = db.from("marsh_messages").select(fields)
    .or(`and(sender_id.eq.${session.userId},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${session.userId})`)
    .order("id",{ascending:false}).limit(51);
  const before = params.get("before");
  if(before) {
    if(!/^\d+$/.test(before) || !Number.isSafeInteger(Number(before))) return Response.json({error:"Invalid message cursor."},{status:400});
    query = query.lt("id",Number(before));
  }
  const {data,error} = await query;
  if(error) return Response.json({error:"Could not load conversation."},{status:500});
  return Response.json({messages:data.slice(0,50).reverse(),hasMore:data.length>50},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session || session.mustChangePin) return Response.json({error:"Please sign in to send messages."},{status:401});
  const input = await request.json().catch(()=>({}));
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if(!uuid.test(input.recipientId || "") || input.recipientId === session.userId || !uuid.test(input.clientId || "") || !body || body.length>4000) return Response.json({error:"Choose a contact and enter a message of 1–4,000 characters."},{status:400});
  const db = getSupabaseAdmin();
  const {data: recipient,error: recipientError} = await db.from("marsh_portal_users").select("id").eq("id",input.recipientId).eq("active",true).maybeSingle();
  if(recipientError) return Response.json({error:"Could not verify contact."},{status:500});
  if(!recipient) return Response.json({error:"This contact is no longer active."},{status:400});
  const {data,error} = await db.from("marsh_messages").insert({sender_id:session.userId,recipient_id:recipient.id,body,client_id:input.clientId}).select(fields).single();
  if(error?.code === "23505") {
    const {data: existing} = await db.from("marsh_messages").select(fields).eq("sender_id",session.userId).eq("client_id",input.clientId).single();
    if(existing) return Response.json({message:existing});
  }
  if(error) return Response.json({error:"Message was not sent. Please retry."},{status:500});
  return Response.json({message:data},{status:201});
}

export async function PATCH(request: Request) {
  const session = await getPortalSession();
  if (!session || session.mustChangePin) return Response.json({error:"Please sign in."},{status:401});
  const input = await request.json().catch(()=>({}));
  if(!uuid.test(input.senderId || "") || !Number.isSafeInteger(input.throughId) || input.throughId<1) return Response.json({error:"Invalid read receipt."},{status:400});
  const {error} = await getSupabaseAdmin().from("marsh_messages").update({read_at:new Date().toISOString()})
    .eq("recipient_id",session.userId).eq("sender_id",input.senderId).lte("id",input.throughId).is("read_at",null);
  return error ? Response.json({error:"Could not update unread messages."},{status:500}) : Response.json({ok:true});
}
