self.addEventListener('push',event=>{
 let data={};try{data=event.data.json();}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Production Command',{body:data.body||'You have a new notification.',icon:'/notification-icon.png',badge:'/notification-icon.png',tag:data.tag||'production-command',data:{url:data.url||'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=new URL(event.notification.data?.url||'/',self.location.origin);if(url.origin!==self.location.origin)return;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{for(const win of windows){if(new URL(win.url).origin===url.origin){await win.navigate(url.href);return win.focus();}}return clients.openWindow(url.href);}));
});
