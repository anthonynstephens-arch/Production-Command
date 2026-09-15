"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeft,MessageCircle,Send,Users,X} from "lucide-react";
import type {PortalSession} from "@/lib/auth";

type Contact = {id:string;display_name:string;active:boolean;unread:number};
type Message = {id:number;sender_id:string;recipient_id:string|null;sender?:{display_name:string};body:string;created_at:string;read_at:string|null};
async function api(url:string,init?:RequestInit) {
  const response = await fetch(url,{cache:"no-store",...init});
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || "Messages are unavailable. Please retry.");
  return data;
}
export default function Messenger({session}:{session:PortalSession}) {
  const [open,setOpen]=useState(false),[contacts,setContacts]=useState<Contact[]>([]),[peer,setPeer]=useState<string|null>("group");
  const [groupUnread,setGroupUnread]=useState(0);
  const [messages,setMessages]=useState<Message[]>([]),[drafts,setDrafts]=useState<Record<string,string>>({}),[error,setError]=useState("");
  const [sending,setSending]=useState(false),[loading,setLoading]=useState(false),[hasMore,setHasMore]=useState(false),[olderLoading,setOlderLoading]=useState(false);
  const currentPeer=useRef(peer), end=useRef<HTMLDivElement>(null), launcher=useRef<HTMLButtonElement>(null), panel=useRef<HTMLDivElement>(null);
  const retry=useRef<{peer:string;body:string;id:string}|null>(null);
  currentPeer.current=peer;
  useEffect(()=>{const target=new URLSearchParams(window.location.search).get('chat');if(target&&(target==='group'||/^[0-9a-f-]{36}$/i.test(target))){setPeer(target);setOpen(true);}},[]);
  const loadContacts=useCallback(async()=>{const data=await api("/api/messages");setContacts(data.contacts);setGroupUnread(data.groupUnread || 0);},[]);
  useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{if(!document.hidden)await loadContacts();}catch(e){if(!stopped)setError((e as Error).message);}finally{if(!stopped)timer=setTimeout(poll,open?3000:10000);}};void poll();return()=>{stopped=true;clearTimeout(timer);};},[loadContacts,open]);
  useEffect(()=>{
    if(!open || !peer)return;
    let stopped=false;let firstLoad=true;let timer:ReturnType<typeof setTimeout>;setLoading(true);setMessages([]);setError("");setHasMore(false);
    const poll=async()=>{
      try{
        if(document.hidden)return;
        const data=await api(`/api/messages?user=${peer}`);
        if(stopped)return;
        setMessages(previous=>{const merged=new Map(previous.map(m=>[m.id,m]));data.messages.forEach((m:Message)=>merged.set(m.id,m));return [...merged.values()].sort((a,b)=>a.id-b.id);});
        if(firstLoad){setHasMore(data.hasMore);firstLoad=false;}
        const last=data.messages.at(-1);
        if(last && document.hasFocus()) {await api("/api/messages",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({senderId:peer,throughId:last.id})});await loadContacts();}
        if(!stopped)setError("");
      }catch(e){if(!stopped)setError((e as Error).message);}finally{if(!stopped){setLoading(false);timer=setTimeout(poll,3000);}}
    };void poll();return()=>{stopped=true;clearTimeout(timer);};
  },[peer,open,loadContacts]);
  const lastId=messages.at(-1)?.id;
  useEffect(()=>{end.current?.scrollIntoView({block:"nearest"});},[lastId,open]);
  useEffect(()=>{if(open)panel.current?.focus();},[open]);
  const close=()=>{setOpen(false);launcher.current?.focus();};
  const isGroup=peer==="group",contact=isGroup?{display_name:"Group chat",active:true}:contacts.find(c=>c.id===peer),unread=contacts.reduce((n,c)=>n+c.unread,groupUnread),draft=peer?drafts[peer] || "":"";
  async function send() {
    if(!peer || !draft.trim() || sending)return;
    const target=peer,body=draft.trim();
    if(retry.current?.peer!==target || retry.current.body!==body)retry.current={peer:target,body,id:crypto.randomUUID()};
    setSending(true);setError("");
    try{const data=await api("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipientId:target,body,clientId:retry.current.id})});
      if(currentPeer.current===target)setMessages(previous=>[...previous.filter(m=>m.id!==data.message.id),data.message].sort((a,b)=>a.id-b.id));
      setDrafts(previous=>({...previous,[target]:""}));retry.current=null;
    }catch(e){setError((e as Error).message);}finally{setSending(false);}
  }
  async function older() {
    if(!peer || !messages.length || olderLoading)return;
    const target=peer;setOlderLoading(true);
    try{const data=await api(`/api/messages?user=${target}&before=${messages[0].id}`);if(currentPeer.current!==target)return;setMessages(previous=>{const merged=new Map([...data.messages,...previous].map((m:Message)=>[m.id,m]));return [...merged.values()].sort((a,b)=>a.id-b.id);});setHasMore(data.hasMore);}catch(e){setError((e as Error).message);}finally{setOlderLoading(false);}
  }
  return <>
    <button ref={launcher} className="chat-launcher" onClick={()=>{if(!open)setPeer("group");setOpen(!open);}} aria-expanded={open} aria-controls="portal-messenger"><Users size={21}/>Group chat{unread>0&&<span className="chat-badge">{unread>99?"99+":unread}</span>}</button>
    {open&&<div id="portal-messenger" ref={panel} tabIndex={-1} className="chat-panel" role="dialog" aria-label="Portal messages" onKeyDown={e=>{if(e.key==="Escape")close();}}>
      <header className="chat-header"><div>{peer&&<button onClick={()=>setPeer(null)} aria-label="Back to contacts"><ArrowLeft size={20}/></button>}<div><strong>{contact?.display_name || "Messages"}</strong><small>{isGroup?"Everyone in the portal":peer?"Private conversation":"Contact anyone in the portal"}</small></div></div><button onClick={close} aria-label="Close messages"><X size={21}/></button></header>
      <nav className="chat-tabs" aria-label="Chat type"><button className={isGroup?"active":""} onClick={()=>setPeer("group")}><Users size={17}/>Group chat{groupUnread>0&&<span className="chat-badge">{groupUnread}</span>}</button><button className={!isGroup?"active":""} onClick={()=>setPeer(null)}><MessageCircle size={16}/>Direct messages</button></nav>
      {error&&<div className="chat-error" role="alert">{error}</div>}
      {!peer?<div className="chat-contacts"><button className="chat-group-card" onClick={()=>setPeer("group")}><span className="chat-avatar"><Users size={21}/></span><span><strong>Group chat</strong><small>Everyone in the portal</small></span>{groupUnread>0&&<span className="chat-badge">{groupUnread}</span>}</button>{!contacts.length&&!error?<p className="chat-empty">No contacts available yet.</p>:contacts.map(c=><button key={c.id} onClick={()=>setPeer(c.id)}><span className="chat-avatar">{c.display_name.slice(0,1)}</span><span><strong>{c.display_name}</strong><small>{c.active?"Send a message":"Inactive · View conversation"}</small></span>{c.unread>0&&<span className="chat-badge">{c.unread}</span>}</button>)}</div>:<>
        <div className="chat-history" role="log" aria-label={`Conversation with ${contact?.display_name || "contact"}`} aria-live="polite">
          {hasMore&&<button className="chat-older" onClick={older} disabled={olderLoading}>{olderLoading?"Loading…":"Load earlier messages"}</button>}
          {loading?<p className="chat-empty">Loading conversation…</p>:!messages.length&&<p className="chat-empty">{isGroup?"Send a message to everyone in the portal.":`Start a conversation with ${contact?.display_name}.`}</p>}
          {messages.map(m=><div key={m.id} className={`chat-message${m.sender_id===session.userId?" mine":""}`}>{isGroup&&<strong className="chat-sender">{m.sender_id===session.userId?"You":m.sender?.display_name || "Portal user"}</strong>}<p>{m.body}</p><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}{m.sender_id===session.userId?m.read_at?" · Read":" · Sent":""}</time></div>)}<div ref={end}/>
        </div>
        <form className="chat-compose" onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="Message" placeholder={contact?.active?"Write a message…":"This contact is inactive"} value={draft} maxLength={4000} disabled={!contact?.active||sending} onChange={e=>setDrafts(previous=>({...previous,[peer]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><button type="submit" aria-label="Send message" disabled={!draft.trim()||sending||!contact?.active}><Send size={20}/></button><small>{sending?"Sending…":"Enter to send · Shift + Enter for a new line"}</small></form>
      </>}
    </div>}
  </>;
}
