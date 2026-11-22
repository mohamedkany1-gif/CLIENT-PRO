/* CLIENT PRO extras v1.1.0: إشعارات النظام + تنبيه التحديثات (محتاج سطر واحد في index.html) */
(()=>{
const APP_VERSION='1.1.0';
const VERSION_URLS=['https://raw.githubusercontent.com/mohamedkany1-gif/CLIENT-PRO/main/version.json','version.json'];
const APK_URL='https://github.com/mohamedkany1-gif/CLIENT-PRO/releases/latest/download/app-debug.apk';
const LN=window.Capacitor?.Plugins?.LocalNotifications;
const native=!!window.Capacitor?.isNativePlatform?.();
const bundled=native&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const CH='reminders_v2',ICON='ic_stat_clientpro',RED='#A52836';
const nid=s=>{let h=0;for(const ch of String(s))h=(Math.imul(31,h)+ch.charCodeAt(0))|0;return 1000000+Math.abs(h)%1900000000};
const queue=[];let ready=false,updInfo=null;

/* ---------- إشعارات التذكير (نظام الجهاز) ---------- */
async function act(a,id){
  try{
    if(LN)LN.cancel({notifications:[{id:nid(id)}]}).catch(()=>{});
    if(a==='tap'){openVisits(id);return}
    if(a==='done'){await db.from('customers').update({reminder_at:null}).eq('id',id);try{await logActivity(id,'reminder_done','تم تنفيذ التذكير')}catch(_){}toast('تم ✓')}
    else if(a==='snooze'){await db.from('customers').update({reminder_at:new Date(Date.now()+600000).toISOString()}).eq('id',id);toast('تم التأجيل 10 دقايق')}
    else return; // stop: إيقاف التنبيه بس والتذكير يفضل ظاهر في القائمة
    await loadCustomers();
  }catch(e){console.warn(e)}
}
async function flush(){while(ready&&queue.length){const[a,id]=queue.shift();await act(a,id)}}
async function sync(){
  if(!LN||!customers.length)return;
  try{
    const old=((await LN.getPending()).notifications||[]).map(n=>n.id).filter(i=>i>=1000000);
    if(old.length)await LN.cancel({notifications:old.map(id=>({id}))});
    const now=Date.now();
    const list=customers.filter(c=>c.reminder_at&&new Date(c.reminder_at).getTime()>now+3000).slice(0,60).map(c=>({
      id:nid(c.id),channelId:CH,smallIcon:ICON,iconColor:RED,actionTypeId:'REMINDER',extra:{customerId:c.id},
      title:'⏰ تذكير زيارة · '+(c.name||'عميل'),
      body:[c.device_type,c.address,c.problem_description].filter(Boolean).join(' · ')||'حان موعد الزيارة',
      schedule:{at:new Date(c.reminder_at),allowWhileIdle:true}
    }));
    if(list.length)await LN.schedule({notifications:list});
  }catch(e){console.warn('sync notif',e)}
}
async function init(){
  if(!LN)return;
  try{
    if((await LN.checkPermissions()).display!=='granted')await LN.requestPermissions();
    await LN.createChannel({id:CH,name:'تذكيرات الزيارات',description:'تنبيهات مواعيد الزيارات',importance:5,visibility:1,vibration:true,lights:true,lightColor:RED});
    await LN.createChannel({id:'updates',name:'التحديثات',importance:3});
    await LN.registerActionTypes({types:[{id:'REMINDER',actions:[{id:'done',title:'✓ تم'},{id:'snooze',title:'⏰ تأجيل 10 د'},{id:'stop',title:'■ إيقاف'}]}]});
    LN.addListener('localNotificationActionPerformed',e=>{const id=e.notification?.extra?.customerId;if(!id)return;queue.push([e.actionId,id]);flush()});
  }catch(e){console.warn('notif init',e)}
}
// التنبيه الفوري القديم كان بيتكرر مع إشعار النظام، فبنوقفه لو الإشعارات الأصلية شغالة
if(LN)window.triggerLocalNotification=()=>{};

/* ---------- تنبيه التحديثات ---------- */
const vn=v=>String(v).split('.').map(n=>parseInt(n)||0);
const newer=(a,b)=>{const x=vn(a),y=vn(b);for(let i=0;i<3;i++){const p=x[i]||0,q=y[i]||0;if(p!==q)return p>q}return false};
function showUpd(){
  const v=updInfo;if(!v)return;
  document.getElementById('updModal')?.remove();
  const apk=bundled?(v.apk||APK_URL):'';
  const m=document.createElement('div');m.className='modal';m.id='updModal';
  m.innerHTML=`<div class="modalbox" style="width:min(460px,100%)"><div class="modalhead"><h2>🚀 تحديث جديد ${esc(v.version)}</h2></div><div class="sub">${esc(v.date||'')} · إصدارك الحالي ${APP_VERSION}</div><strong style="display:block;margin-top:12px;font-size:13px">ما الجديد:</strong><ul style="padding-inline-start:20px;line-height:2;font-size:13px;margin:6px 0 0">${(v.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul><div class="form-actions"><button class="btn primary" id="updGo">${apk?'تحميل النسخة الجديدة':'تحديث الآن'}</button><button class="btn" id="updLater">لاحقاً</button></div></div>`;
  document.body.appendChild(m);
  m.onclick=e=>{if(e.target===m)m.remove()};
  m.querySelector('#updLater').onclick=()=>m.remove();
  m.querySelector('#updGo').onclick=async()=>{
    if(apk){window.open(apk,'_blank');return}
    try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)}catch(_){}
    await Promise.all([location.pathname,'app-extras.js'].map(u=>fetch(u,{cache:'reload'}).catch(()=>{})));
    location.reload();
  };
}
function maybeShow(){
  if(!updInfo||$('app').classList.contains('hidden')||localStorage.getItem('cp_upd_s')===updInfo.version)return;
  localStorage.setItem('cp_upd_s',updInfo.version);showUpd();
}
async function check(manual){
  try{
    let v;
    for(const u of VERSION_URLS){try{const r=await fetch(u+'?t='+Date.now(),{cache:'no-store'});if(r.ok){v=await r.json();break}}catch(_){}}
    if(!v)throw 0;
    if(!newer(v.version,APP_VERSION)){if(manual===true)toast('أنت على آخر إصدار ('+APP_VERSION+')');return}
    updInfo=v;$('updBtn').classList.remove('hidden');
    if(LN&&localStorage.getItem('cp_upd_n')!==v.version){
      localStorage.setItem('cp_upd_n',v.version);
      LN.schedule({notifications:[{id:7777,channelId:'updates',smallIcon:ICON,iconColor:RED,title:'🚀 تحديث جديد لـ CLIENT PRO',body:'الإصدار '+v.version+' متاح — افتح التطبيق لمعرفة الجديد',schedule:{at:new Date(Date.now()+500)}}]}).catch(()=>{});
    }
    maybeShow();
  }catch(_){if(manual===true)toast('تعذر فحص التحديثات')}
}

/* ---------- تشغيل ---------- */
const b=document.createElement('button');b.id='updBtn';b.className='btn hidden';b.textContent='🚀 تحديث جديد';b.onclick=showUpd;$('logoutBtn').before(b);
const f=document.querySelector('.foot');
if(f){f.innerHTML=`CLIENT PRO · v${APP_VERSION} · <a href="#" id="chkUpd" style="color:inherit">فحص التحديثات</a>`;$('chkUpd').onclick=e=>{e.preventDefault();check(true)}}
const _lc=window.loadCustomers;
window.loadCustomers=async function(){await _lc();ready=customers.length>0;sync();flush();if(!updInfo)check();else maybeShow()};
init();check();
setInterval(check,15*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
})();
