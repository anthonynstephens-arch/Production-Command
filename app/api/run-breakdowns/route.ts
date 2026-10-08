import {getPortalSession} from "@/lib/auth";
import {getSupabaseAdmin} from "@/lib/supabase-admin";
const keys=["whatupdoe","did_you_call_first","upside_down_welcome","marsh_supply"];
export async function GET(){
 const session=await getPortalSession();
 if(!session||session.mustChangePin)return Response.json({error:"Unauthorized"},{status:401});
 const db=getSupabaseAdmin();
 const [runs,defects]=await Promise.all([db.from("marsh_run_breakdowns").select("*").order("scheduled_date",{ascending:false}),db.from("marsh_defective_mats").select("id,run_id,quantity,credit_amount,reason,received_date")]);
 if(runs.error||defects.error)return Response.json({error:"Could not load run breakdowns."},{status:500});
 return Response.json({runs:runs.data,defects:defects.data});
}
export async function PATCH(request:Request){
 const session=await getPortalSession();
 if(!session||session.mustChangePin)return Response.json({error:"Unauthorized"},{status:401});
 if(session.role!=="admin")return Response.json({error:"Admin access required."},{status:403});
 const body=await request.json().catch(()=>({}));
 const actual=Object.fromEntries(keys.map(key=>[key,Number(body.actual?.[key])]));
 if(keys.some(key=>!Number.isSafeInteger(actual[key])||actual[key]<0||actual[key]>100000)||typeof body.expectedUpdatedAt!=="string")return Response.json({error:"Enter whole-number printed quantities."},{status:400});
 const {data,error}=await getSupabaseAdmin().from("marsh_run_breakdowns").update({actual,notes:String(body.notes||"").slice(0,2000),updated_at:new Date().toISOString(),updated_by:session.userId}).eq("run_id",body.runId).eq("updated_at",body.expectedUpdatedAt).select("*").maybeSingle();
 if(error)return Response.json({error:"Could not save the run breakdown."},{status:500});
 if(!data)return Response.json({error:"This breakdown changed. Refresh and try again."},{status:409});
 return Response.json({ok:true,run:data});
}
