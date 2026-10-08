import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const session = await getPortalSession();
  if (!session || session.mustChangePin) return Response.json({error:"Unauthorized"},{status:401});
  const db = getSupabaseAdmin();
  const {data,error} = await db.from("marsh_defective_mats").select("*").order("created_at",{ascending:false});
  if(error) return Response.json({error:"Could not load defective mats."},{status:500});
  const records = await Promise.all(data.map(async record => {
    const photos = await Promise.all((record.photo_paths as string[]).map(async path => {
      const {data} = await db.storage.from("marsh-defect-photos").createSignedUrl(path,3600);
      return data?.signedUrl || null;
    }));
    return {...record,photos:photos.filter(Boolean)};
  }));
  return Response.json({records});
}

export async function POST(request:Request) {
  const session = await getPortalSession();
  if (!session || session.mustChangePin) return Response.json({error:"Unauthorized"},{status:401});
  if(session.role!=="admin") return Response.json({error:"Admin access required."},{status:403});
  const body = await request.json().catch(()=>({}));
  if(!/^[0-9a-f-]{36}$/i.test(body.id||"") || !Number.isInteger(Number(body.quantity)) || Number(body.quantity)<1 || Number(body.quantity)>100000 || !String(body.reason||"").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(body.receivedDate||"")) return Response.json({error:"Enter a quantity, received date, and defect description."},{status:400});
  const {data,error} = await getSupabaseAdmin().rpc("record_marsh_defective_mats",{
    p_id:body.id,p_quantity:Number(body.quantity),p_reason:String(body.reason).trim().slice(0,2000),p_received_date:body.receivedDate,
    p_delivery_id:body.deliveryId||null,p_run_id:body.runId||null,p_remove_inventory:body.removeInventory===true,p_actor:session.userId,p_actor_name:session.name,
  });
  if(error) return Response.json({error:error.code==="P0001"?error.message:"Could not save defective mats."},{status:400});
  return Response.json({ok:true,record:data});
}

export async function PATCH(request:Request) {
  const session = await getPortalSession();
  if (!session || session.mustChangePin) return Response.json({error:"Unauthorized"},{status:401});
  if(session.role!=="admin") return Response.json({error:"Admin access required."},{status:403});
  const body=await request.json().catch(()=>({}));
  if(body.action==="link_run"){
    const db=getSupabaseAdmin();
    if(body.runId){const {data}=await db.from("marsh_run_breakdowns").select("run_id").eq("run_id",body.runId).maybeSingle();if(!data)return Response.json({error:"Production run not found."},{status:400});}
    const {data,error}=await db.from("marsh_defective_mats").update({run_id:body.runId||null}).eq("id",body.id).select("id").maybeSingle();
    if(error||!data)return Response.json({error:"Could not link the production run."},{status:400});
    return Response.json({ok:true});
  }
  const rate=Number(body.rate);
  if(!Number.isFinite(rate)||rate<=0||rate>14||Math.abs(Math.round(rate*100)-rate*100)>0.000001) return Response.json({error:"Enter a credit per mat from $0.01 to $14.00."},{status:400});
  const {data,error}=await getSupabaseAdmin().rpc("credit_marsh_defective_mats",{p_id:body.id,p_rate:rate,p_actor:session.userId,p_actor_name:session.name});
  if(error) return Response.json({error:error.code==="P0001"?error.message:"Could not issue credit."},{status:400});
  return Response.json({ok:true,record:data});
}
