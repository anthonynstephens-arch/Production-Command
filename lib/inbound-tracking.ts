export type TrackingResult = { carrier:string; slug:string; trackingUrl:string; etaStart:string|null; etaEnd:string|null; status:"expected"|"in_transit"|"delivered"; message:string };

function guessCarrier(number:string, selected?:string) {
  const clean=number.replace(/\s+/g,"").toUpperCase();
  if(/^1Z[0-9A-Z]{16}$/.test(clean)) return {carrier:"UPS",slug:"ups",url:`https://www.ups.com/track?tracknum=${encodeURIComponent(clean)}`};
  if(/^\d{12,22}$/.test(clean)) return {carrier:"FedEx",slug:"fedex",url:`https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(clean)}`};
  const carrier=selected&&selected!=="Other"?selected:"Carrier";
  return {carrier,slug:carrier.toLowerCase().replace(/[^a-z0-9]+/g,"-"),url:""};
}

function mapStatus(tag?:string):TrackingResult["status"] {
  const value=(tag||"").toLowerCase();
  if(value.includes("deliver")) return "delivered";
  if(["transit","outfordelivery","attemptfail","exception"].some(term=>value.includes(term))) return "in_transit";
  return "expected";
}

export async function lookupInboundTracking(trackingNumber:string, selectedCarrier?:string):Promise<TrackingResult> {
  const guessed=guessCarrier(trackingNumber,selectedCarrier);
  const fallback:TrackingResult={carrier:guessed.carrier,slug:guessed.slug,trackingUrl:guessed.url,etaStart:null,etaEnd:null,status:"expected",message:"Tracking saved. Carrier estimate pending."};
  const key=process.env.AFTERSHIP_API_KEY;
  if(!key) return fallback;
  const headers={"aftership-api-key":key,"content-type":"application/json"};
  try {
    let slug=guessed.slug;
    const detected=await fetch("https://api.aftership.com/v4/couriers/detect",{method:"POST",headers,body:JSON.stringify({tracking:{tracking_number:trackingNumber}})});
    if(detected.ok){const json=await detected.json();slug=json?.data?.couriers?.[0]?.slug||slug}
    let response=await fetch("https://api.aftership.com/v4/trackings",{method:"POST",headers,body:JSON.stringify({tracking:{tracking_number:trackingNumber,slug}})});
    if(!response.ok) response=await fetch(`https://api.aftership.com/v4/trackings/${encodeURIComponent(slug)}/${encodeURIComponent(trackingNumber)}`,{headers});
    if(!response.ok) return fallback;
    const json=await response.json(); const item=json?.data?.tracking;
    const eta=item?.expected_delivery?String(item.expected_delivery).slice(0,10):null;
    return {carrier:item?.slug==="ups"?"UPS":item?.slug==="fedex"?"FedEx":guessed.carrier,slug:item?.slug||slug,trackingUrl:guessed.url,etaStart:eta,etaEnd:eta,status:mapStatus(item?.tag),message:item?.subtag_message||item?.checkpoints?.at(-1)?.message||"Tracking updated."};
  } catch { return fallback; }
}
