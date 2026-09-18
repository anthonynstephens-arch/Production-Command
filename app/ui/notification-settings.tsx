"use client";
import {useEffect,useRef,useState} from 'react';
import {Bell,X} from 'lucide-react';
type Preferences={channel:'none'|'push'|'email'|'both';email:string;chat:boolean;billing:boolean;supplies:boolean;shipping_issues:boolean};
const defaults:Preferences={channel:'none',email:'',chat:true,billing:false,supplies:false,shipping_issues:true};
async function api(path:string,body?:object,method='POST'){const r=await fetch('/api/notifications/'+path,{method:body?method:'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Notification settings unavailable.');return data;}
export async function disconnectPushDevice(){if(!('serviceWorker' in navigator))return;const reg=await navigator.serviceWorker.getRegistration('/');const subscription=await reg?.pushManager.getSubscription();if(subscription){await api('subscribe',{endpoint:subscription.endpoint},'DELETE');await subscription.unsubscribe();}}
export default function NotificationSettings(){
 const [open,setOpen]=useState(false),[preferences,setPreferences]=useState<Preferences>(defaults),[publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[ready,setReady]=useState(false),[device,setDevice]=useState(false),[supported,setSupported]=useState(false),[ios,setIos]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{setSupported('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.matchMedia('(display-mode: standalone)').matches);
  api('preferences').then(async data=>{setPreferences({...defaults,...data.preferences,email:data.preferences?.email||data.defaultEmail});setPublicKey(data.publicKey);setReady(true);if(!data.preferences||new URLSearchParams(window.location.search).has('notifications'))setOpen(true);
   if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.register('/notification-sw.js');const sub=await reg.pushManager?.getSubscription();setDevice(!!sub);if(sub&&['push','both'].includes(data.preferences?.channel))await api('subscribe',sub.toJSON());}
  }).catch(e=>{setMessage(e.message);setReady(true);});
 },[]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 async function enablePush(){
  if(!supported||ios){setMessage('On iPhone or iPad: tap Share → Add to Home Screen, open the saved app, then enable push. Other devices need a browser that supports notifications.');return false;}
  const permission=await Notification.requestPermission();if(permission!=='granted'){setMessage('Push permission was not granted. You can enable it in your device settings or choose email.');return false;}
  const reg=await navigator.serviceWorker.register('/notification-sw.js');await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});await api('subscribe',sub.toJSON());setDevice(true);return true;
 }
 async function save(choice=preferences){
  setBusy(true);setMessage('');try{
   if(['push','both'].includes(choice.channel)&&!device){if(!await enablePush())return;}
   await api('preferences',choice,'PUT');setPreferences(choice);setMessage('Notification preferences saved.');setOpen(false);
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <>
  <button className="view-toggle notification-settings-button" onClick={()=>setOpen(true)}><Bell size={16}/>Notifications</button>
  <dialog ref={dialog} className="notification-dialog" onCancel={()=>setOpen(false)}>
   <div className="notification-title"><div><Bell size={22}/><h2>Stay in the loop</h2></div><button aria-label="Close notification settings" onClick={()=>setOpen(false)}><X size={20}/></button></div>
   <p>Choose how you receive Production Command updates.</p>
   {!ready?<p>Loading settings…</p>:<>
    <div className="notification-channels">{(['push','email','both','none'] as const).map(channel=><label className={preferences.channel===channel?'selected':''} key={channel}><input type="radio" name="notification-channel" checked={preferences.channel===channel} onChange={()=>setPreferences({...preferences,channel})}/>{({push:'Push',email:'Email',both:'Both',none:'Not now'})[channel]}</label>)}</div>
    {['email','both'].includes(preferences.channel)&&<label className="notification-email">Email address<input type="email" autoComplete="email" value={preferences.email} onChange={e=>setPreferences({...preferences,email:e.target.value})}/></label>}
    {['push','both'].includes(preferences.channel)&&<div className="notification-device"><p>{device?'Push is enabled on this device.':ios?'On iPhone: Share → Add to Home Screen, then open the saved app to enable push.':'Saving will ask permission to enable push on this device.'}</p>{device&&<button type="button" onClick={async()=>{try{await disconnectPushDevice();setDevice(false);}catch(e){setMessage((e as Error).message);}}}>Disable this device</button>}</div>}
    {preferences.channel!=='none'&&<fieldset><legend>Send me alerts about</legend>{(['shipping_issues','chat','billing','supplies'] as const).map(key=><label key={key}><input type="checkbox" checked={preferences[key]} onChange={e=>setPreferences({...preferences,[key]:e.target.checked})}/>{({shipping_issues:'Orders unable to ship',chat:'Group chat and my direct messages',billing:'Ledger charges and daily balance reminders',supplies:'Low supplies'})[key]}</label>)}</fieldset>}
    {['email','both'].includes(preferences.channel)&&<p className="notification-note">Shipping-issue and group-message email alerts are connected. Push supports every alert category.</p>}
    <button type="button" disabled={busy} className="notification-test" onClick={async()=>{setBusy(true);try{const data=await api("test",{});setMessage(data.message);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Send test to my saved channels</button>
    <div className="notification-actions"><button className="sync-button" disabled={busy} onClick={()=>save()}>{busy?'Saving…':'Save preferences'}</button><button disabled={busy} onClick={()=>save({...preferences,channel:'none'})}>Not now</button></div>
   </>}{message&&<p role="status">{message}</p>}
  </dialog>
 </>;
}
