import { randomUUID } from "node:crypto";
import { getPortalSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request:Request) {
  const session=await getPortalSession();
  if(!session||session.mustChangePin) return Response.json({error:"Unauthorized"},{status:401});
  if(session.role!=="admin") return Response.json({error:"Admin access required."},{status:403});
  if(Number(request.headers.get("content-length"))>3500000) return Response.json({error:"Photo must be under 3 MB."},{status:413});
  const form=await request.formData().catch(()=>null);
  const id=String(form?.get("id")||"");
  const file=form?.get("photo");
  if(!(file instanceof File)||file.size>3000000||!file.size||!["image/jpeg","image/png","image/webp"].includes(file.type)) return Response.json({error:"Use a JPG, PNG, or WebP photo under 3 MB."},{status:400});
  const db=getSupabaseAdmin();
  const {data:record}=await db.from("marsh_defective_mats").select("id").eq("id",id).maybeSingle();
  if(!record) return Response.json({error:"Defect record not found."},{status:404});
  const bytes=Buffer.from(await file.arrayBuffer());
  const valid=file.type==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:file.type==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!valid) return Response.json({error:"Invalid image file."},{status:400});
  const path=`${id}/${randomUUID()}.${file.type==="image/jpeg"?"jpg":file.type.split("/")[1]}`;
  const {error}=await db.storage.from("marsh-defect-photos").upload(path,bytes,{contentType:file.type});
  if(error) return Response.json({error:"Could not upload photo."},{status:500});
  const {error:saveError}=await db.rpc("append_marsh_defect_photo",{p_id:id,p_path:path});
  if(saveError){await db.storage.from("marsh-defect-photos").remove([path]);return Response.json({error:"Could not attach photo."},{status:500});}
  return Response.json({ok:true});
}
