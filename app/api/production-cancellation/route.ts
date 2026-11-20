import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getPortalSession(); if (!session) return Response.json({error:"Unauthorized"},{status:401});
  const {data,error} = await getSupabaseAdmin().from("marsh_production_cancellations").select("run_id,scheduled_date,reason,replacement_date").eq("active",true).order("cancelled_at",{ascending:false}).limit(1).maybeSingle();
  if (error) return Response.json({error:"Could not load the production notice."},{status:500});
  return Response.json({notice:data},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request: Request) {
  const session=await getPortalSession(); if (!session) return Response.json({error:"Unauthorized"},{status:401});
  if (session.role!=="admin") return Response.json({error:"Admin access required."},{status:403});
  const body=await request.json().catch(()=>({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(body.run_id)) || !Number.isFinite(Date.parse(body.expected_updated_at)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.replacement_date)) || !/^\d{2}:\d{2}$/.test(String(body.replacement_time)) || typeof body.reason!=="string" || !body.reason.trim() || body.reason.length>1000) return Response.json({error:"Enter a reason, replacement date and time."},{status:400});
  const {data,error}=await getSupabaseAdmin().rpc("marsh_cancel_production_run",{expected_run:body.run_id,expected_version:body.expected_updated_at,why:body.reason,replacement:body.replacement_date,replacement_time:body.replacement_time,actor:session.userId});
  if(error) return Response.json({error:error.code==="P0001"?error.message:"Could not cancel the run."},{status:error.code==="P0001"?409:500});
  return Response.json({...data,plan:{...data.plan,server_now:new Date().toISOString()}});
}
export async function DELETE() {
  const session=await getPortalSession(); if (!session) return Response.json({error:"Unauthorized"},{status:401});
  if(session.role!=="admin") return Response.json({error:"Admin access required."},{status:403});
  const {error}=await getSupabaseAdmin().from("marsh_production_cancellations").update({active:false}).eq("active",true);
  if(error) return Response.json({error:"Could not clear the notice."},{status:500});
  return Response.json({ok:true});
}
