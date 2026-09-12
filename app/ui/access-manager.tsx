"use client";
import { KeyRound, Mail, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";

type User = { id:string; display_name:string; email:string|null; role:"admin"|"partner"; must_change_pin:boolean; last_login:string|null; login_count:number };

export default function AccessManager() {
  const [users,setUsers]=useState<User[]>([]); const [selected,setSelected]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  async function load(){const response=await fetch("/api/users");if(response.ok){const body=await response.json();setUsers(body.users??[]);if(!selected&&body.users?.[0])setSelected(body.users[0].id)}}
  useEffect(()=>{load()},[]);
  useEffect(()=>{const user=users.find(item=>item.id===selected);setEmail(user?.email??"");setPassword("")},[selected,users]);
  async function save(event:React.FormEvent){event.preventDefault();setSaving(true);setMessage("");const response=await fetch("/api/users",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({userId:selected,email,password})});const body=await response.json();setSaving(false);setMessage(response.ok?"Email sign-in updated.":body.error??"Could not update access.");if(response.ok){setPassword("");load()}}
  return <section className="panel access-panel"><div className="access-heading"><div className="icon-box"><Users size={20}/></div><div><p className="eyebrow">ADMIN ACCESS</p><h2>Portal users</h2><p>Assign an email and temporary password without changing personal PIN access.</p></div></div><div className="user-strip">{users.map(user=><button type="button" key={user.id} className={selected===user.id?"selected":""} onClick={()=>setSelected(user.id)}><strong>{user.display_name}</strong><span>{user.role==="admin"?"Admin":"Marsh"} · {user.email??"PIN only"}</span>{user.must_change_pin&&<i>PIN change required</i>}</button>)}</div><form className="access-form" onSubmit={save}><label><span><Mail size={15}/>Email address</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="name@example.com" required/></label><label><span><KeyRound size={15}/>Temporary password</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} minLength={8} placeholder="At least 8 characters" required/></label><button className="sync-button" disabled={saving||!selected}><Save size={16}/>{saving?"Saving…":"Enable email sign-in"}</button></form>{message&&<div className="access-message">{message}</div>}</section>;
}
