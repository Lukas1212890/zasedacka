const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function bad(message, status = 400) { return json({ error: message }, status); }

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sessionToken(env) {
  return sha256Hex(`${env.ADMIN_USERNAME}:${env.ADMIN_PASSWORD}:${env.SESSION_SECRET}:zasedacka-admin`);
}

async function isAdmin(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)zasedacka_admin=([^;]+)/);
  if (!m) return false;
  return m[1] === await sessionToken(env);
}

function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
function validTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s || ''); }
function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim()); }
function clean(s, max = 120) { return String(s ?? '').trim().slice(0, max); }

async function conflict(env, date, from, to, excludeId = null) {
  let sql = `SELECT id FROM reservations WHERE date = ? AND time_from < ? AND time_to > ?`;
  const args = [date, to, from];
  if (excludeId !== null) { sql += ` AND id != ?`; args.push(excludeId); }
  const row = await env.DB.prepare(sql).bind(...args).first();
  return !!row;
}

async function parseReservation(request) {
  const b = await request.json();
  const out = {
    date: clean(b.date, 10), time_from: clean(b.time_from, 5), time_to: clean(b.time_to, 5),
    name: clean(b.name, 100), phone: clean(b.phone, 40), email: clean(b.email, 160),
    note: clean(b.note, 1000)
  };
  if (!validDate(out.date)) throw new Error('Vyplňte platné datum.');
  if (!validTime(out.time_from) || !validTime(out.time_to)) throw new Error('Vyplňte čas od a do.');
  if (out.time_from >= out.time_to) throw new Error('Čas „do“ musí být později než čas „od“.');
  if (!out.name) throw new Error('Vyplňte jméno.');
  if (!out.phone) throw new Error('Vyplňte telefon.');
  if (!validEmail(out.email)) throw new Error('Vyplňte platný e-mail.');
  return out;
}

const HTML = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zasedačka</title>
<style>
:root{--bg:#fff5f9;--card:#fff;--text:#3b1f2c;--muted:#8d6a79;--line:#f2d8e3;--accent:#d94f86;--accent2:#fff0f6;--danger:#b42352;--shadow:0 12px 35px rgba(167,54,100,.12)}*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:var(--bg);color:var(--text)}button,input{font:inherit}.wrap{max-width:1180px;margin:auto;padding:24px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.brand h1{margin:0;font-size:30px;color:#b72f68}.brand p{margin:5px 0 0;color:var(--muted)}.btn{border:0;border-radius:12px;padding:11px 15px;cursor:pointer;background:#fbe7f0;color:var(--text);font-weight:700}.btn.primary{background:var(--accent);color:white}.btn.danger{background:#fee8f0;color:var(--danger)}.btn:disabled{opacity:.45;cursor:not-allowed}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--card);padding:14px 16px;border-radius:16px;box-shadow:var(--shadow);margin-bottom:14px}.toolbar .nav{display:flex;gap:8px}.month{font-weight:800;font-size:20px;text-transform:capitalize}.calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:var(--shadow)}.dow{background:#fceaf2;padding:10px;text-align:center;font-weight:800;font-size:12px;color:var(--muted)}.day{min-height:150px;background:var(--card);padding:9px;position:relative}.day.out{background:#fff9fb;color:#c7a8b5}.daynum{font-weight:800;margin-bottom:7px}.day.today .daynum{display:inline-grid;place-items:center;background:var(--accent);color:#fff;width:28px;height:28px;border-radius:50%}.slot{border-left:4px solid var(--accent);background:var(--accent2);padding:7px 8px;margin:6px 0;border-radius:8px;cursor:pointer;font-size:12px}.slot b{display:block}.slot small{color:#87536a}.add{position:absolute;right:8px;top:7px;border:0;background:transparent;color:var(--accent);font-size:22px;cursor:pointer}.modal{position:fixed;inset:0;background:rgba(74,26,47,.48);display:none;align-items:center;justify-content:center;padding:20px;z-index:30}.modal.open{display:flex}.dialog{width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--card);border-radius:18px;padding:22px;box-shadow:0 25px 70px rgba(91,28,55,.25)}.dialog h2{margin:0 0 16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.field.full{grid-column:1/-1}.field label{font-size:13px;font-weight:800}.field input{border:1px solid var(--line);border-radius:10px;padding:12px;background:white;min-width:0}.field input:focus{outline:2px solid #f4a8c7;border-color:var(--accent)}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:8px;flex-wrap:wrap}.msg{min-height:20px;color:var(--danger);font-size:13px;font-weight:700}.detail{line-height:1.7}.adminBadge{display:none;background:#fde2ee;color:#a62f62;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800}.adminBadge.show{display:inline-block}.empty{color:var(--muted);font-size:12px}.required:after{content:' *';color:var(--danger)}
@media(max-width:760px){.wrap{padding:12px}.calendar{display:block;background:transparent;border:0;box-shadow:none}.dow{display:none}.day{min-height:auto;margin-bottom:10px;border:1px solid var(--line);border-radius:14px;padding:12px}.day.out{display:none}.toolbar{position:sticky;top:0;z-index:5}.grid{grid-template-columns:1fr}.top{align-items:flex-start}.brand h1{font-size:25px}}
.dialog{overflow-x:hidden;overflow-y:auto}.grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);width:100%}.field{min-width:0;max-width:100%}.field input,.field textarea{width:100%;max-width:100%}.field textarea{font:inherit;border:1px solid var(--line);border-radius:10px;padding:12px;background:white;min-width:0;resize:vertical}.field textarea:focus{outline:2px solid #f4a8c7;border-color:var(--accent)}
@media(max-width:760px){#reserveModal{padding:6px;align-items:center}#reserveModal .dialog{width:100%;max-height:calc(100dvh - 12px);padding:14px;border-radius:15px}#reserveModal .dialog h2{font-size:21px;margin-bottom:10px}#reserveModal .grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px 9px}#reserveModal .field{gap:3px;margin-bottom:3px}#reserveModal .field label{font-size:12px}#reserveModal .field input,#reserveModal .field textarea{padding:8px 9px;border-radius:8px;font-size:14px}#reserveModal .field textarea{height:54px;min-height:54px;resize:none}#reserveModal .actions{margin-top:5px;gap:7px}#reserveModal .actions .btn{padding:9px 12px}#reserveModal .msg{min-height:16px;font-size:12px}}
@media(max-width:480px){#reserveModal .dialog{padding:10px 12px}#reserveModal .dialog h2{font-size:19px;margin-bottom:7px}#reserveModal .grid{grid-template-columns:minmax(0,1fr);gap:3px}#reserveModal .field{grid-column:1/-1;margin-bottom:1px}#reserveModal .field input,#reserveModal .field textarea{display:block;width:100%;min-width:0;max-width:100%;height:36px;padding:6px 8px;font-size:16px;-webkit-appearance:none;appearance:none}#reserveModal .field textarea{height:40px;min-height:40px}#reserveModal .actions{margin-top:3px}#reserveModal .actions .btn{padding:7px 10px;font-size:13px}}
</style></head><body>
<div class="wrap"><div class="top"><div class="brand"><h1>Zasedačka</h1><p>Rezervační kalendář zasedací místnosti</p></div><div style="display:flex;gap:8px;align-items:center"><span id="adminBadge" class="adminBadge">ADMIN</span><button id="adminBtn" class="btn">Admin</button></div></div>
<div class="toolbar"><div class="nav"><button id="prev" class="btn">‹</button><button id="today" class="btn">Dnes</button><button id="next" class="btn">›</button></div><div id="month" class="month"></div><button id="newBtn" class="btn primary">+ Nová rezervace</button></div>
<div id="calendar" class="calendar"></div></div>
<div id="reserveModal" class="modal"><div class="dialog"><h2 id="formTitle">Nová rezervace</h2><form id="reserveForm"><input type="hidden" id="rid"><div class="grid"><div class="field full"><label class="required">Datum</label><input id="date" type="date" required></div><div class="field"><label class="required">Čas od</label><input id="from" type="time" required></div><div class="field"><label class="required">Čas do</label><input id="to" type="time" required></div><div class="field full"><label class="required">Jméno</label><input id="name" required maxlength="100"></div><div class="field"><label class="required">Telefon</label><input id="phone" type="tel" required maxlength="40"></div><div class="field"><label class="required">E-mail</label><input id="email" type="email" required maxlength="160"></div><div class="field full"><label>Poznámka</label><textarea id="note" rows="4" maxlength="1000" placeholder="Volitelná poznámka k rezervaci"></textarea></div></div><div id="formMsg" class="msg"></div><div class="actions"><button type="button" class="btn" data-close>Storno</button><button class="btn primary" type="submit">Uložit rezervaci</button></div></form></div></div>
<div id="detailModal" class="modal"><div class="dialog"><h2>Rezervace</h2><div id="detail" class="detail"></div><div class="actions"><button id="deleteBtn" class="btn danger" style="display:none">Smazat</button><button id="editBtn" class="btn" style="display:none">Upravit</button><button class="btn primary" data-close>Zavřít</button></div></div></div>
<div id="adminModal" class="modal"><div class="dialog"><h2>Přihlášení administrátora</h2><form id="adminForm"><div class="field"><label>Uživatelské jméno</label><input id="adminUsername" autocomplete="username" required></div><div class="field"><label>Heslo</label><input id="adminPassword" type="password" autocomplete="current-password" required></div><div id="adminMsg" class="msg"></div><div class="actions"><button type="button" class="btn" data-close>Storno</button><button class="btn primary">Přihlásit</button></div></form></div></div>
<script>
const $=s=>document.querySelector(s), cal=$('#calendar'); let cursor=new Date(); cursor.setDate(1); let reservations=[], admin=false, selected=null, deleteArmed=false;
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day};
function open(id){$(id).classList.add('open')} function closeAll(){document.querySelectorAll('.modal').forEach(x=>x.classList.remove('open'))}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeAll)); document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeAll()}));
async function api(url,opt){const r=await fetch(url,{headers:{'content-type':'application/json'},...opt});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Něco se nepovedlo.');return j}
async function load(){const y=cursor.getFullYear(),m=String(cursor.getMonth()+1).padStart(2,'0'); const j=await api('/api/reservations?month='+y+'-'+m); reservations=j.reservations; admin=j.admin; render();}
function render(){const y=cursor.getFullYear(),m=cursor.getMonth(); $('#month').textContent=cursor.toLocaleDateString('cs-CZ',{month:'long',year:'numeric'}); $('#adminBadge').classList.toggle('show',admin); $('#adminBtn').textContent=admin?'Odhlásit':'Admin'; cal.innerHTML=['Po','Út','St','Čt','Pá','So','Ne'].map(x=>'<div class="dow">'+x+'</div>').join(''); const first=new Date(y,m,1), shift=(first.getDay()+6)%7, start=new Date(y,m,1-shift); const today=iso(new Date()); for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ds=iso(d), out=d.getMonth()!==m; const items=reservations.filter(r=>r.date===ds); const div=document.createElement('div');div.className='day'+(out?' out':'')+(ds===today?' today':'');div.innerHTML='<div class="daynum">'+d.getDate()+'</div><button class="add" title="Přidat rezervaci">+</button><div class="slots"></div>'; div.querySelector('.add').addEventListener('click',()=>showForm(ds)); const slots=div.querySelector('.slots'); if(items.length===0&&!out) slots.innerHTML='<div class="empty">Volno</div>'; items.forEach(r=>{const el=document.createElement('div');el.className='slot';el.innerHTML='<b>'+esc(r.time_from)+'–'+esc(r.time_to)+'</b><small>'+esc(r.name)+'</small>';el.addEventListener('click',()=>showDetail(r));slots.appendChild(el)});cal.appendChild(div)}}
function showForm(date,r=null){$('#rid').value=r?.id||'';$('#formTitle').textContent=r?'Upravit rezervaci':'Nová rezervace';$('#date').value=r?.date||date||iso(new Date());$('#from').value=r?.time_from||'';$('#to').value=r?.time_to||'';$('#name').value=r?.name||'';$('#phone').value=r?.phone||'';$('#email').value=r?.email||'';$('#note').value=r?.note||'';$('#formMsg').textContent='';open('#reserveModal')}
function showDetail(r){selected=r;deleteArmed=false;$('#deleteBtn').textContent='Smazat';const note=r.note?'<br><br><b>Poznámka</b><br>'+esc(r.note).replace(/\\n/g,'<br>'):'';$('#detail').innerHTML='<b>'+esc(r.date)+'</b><br>'+esc(r.time_from)+'–'+esc(r.time_to)+'<br><br><b>'+esc(r.name)+'</b><br>'+esc(r.phone)+'<br>'+esc(r.email)+note;$('#editBtn').style.display=admin?'inline-block':'none';$('#deleteBtn').style.display=admin?'inline-block':'none';open('#detailModal')}
$('#reserveForm').addEventListener('submit',async e=>{e.preventDefault(); const body={date:$('#date').value,time_from:$('#from').value,time_to:$('#to').value,name:$('#name').value,phone:$('#phone').value,email:$('#email').value,note:$('#note').value}; const id=$('#rid').value; try{await api(id?'/api/reservations/'+id:'/api/reservations',{method:id?'PUT':'POST',body:JSON.stringify(body)});closeAll();await load()}catch(err){$('#formMsg').textContent=err.message}});
$('#adminForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:$('#adminUsername').value,password:$('#adminPassword').value})});$('#adminPassword').value='';closeAll();await load()}catch(err){$('#adminMsg').textContent=err.message}});
$('#adminBtn').addEventListener('click',async()=>{if(admin){await api('/api/admin/logout',{method:'POST'});await load()}else{$('#adminMsg').textContent='';open('#adminModal')}});
$('#editBtn').addEventListener('click',()=>{closeAll();showForm(selected.date,selected)});$('#deleteBtn').addEventListener('click',async()=>{if(!selected)return;if(!deleteArmed){deleteArmed=true;$('#deleteBtn').textContent='Potvrdit smazání';setTimeout(()=>{deleteArmed=false;$('#deleteBtn').textContent='Smazat'},4000);return}try{await api('/api/reservations/'+selected.id,{method:'DELETE'});deleteArmed=false;closeAll();await load()}catch(e){deleteArmed=false;$('#deleteBtn').textContent='Smazat';alert(e.message)}});
$('#newBtn').addEventListener('click',()=>showForm(iso(new Date())));$('#prev').addEventListener('click',()=>{cursor.setMonth(cursor.getMonth()-1);load()});$('#next').addEventListener('click',()=>{cursor.setMonth(cursor.getMonth()+1);load()});$('#today').addEventListener('click',()=>{cursor=new Date();cursor.setDate(1);load()});
const refreshCalendar=()=>{if(!document.hidden)load().catch(()=>{})};document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCalendar()});window.addEventListener('focus',refreshCalendar);setInterval(refreshCalendar,10000);load();
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/' && request.method === 'GET') return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });

      if (url.pathname === '/api/reservations' && request.method === 'GET') {
        const month = url.searchParams.get('month');
        if (!/^\d{4}-\d{2}$/.test(month || '')) return bad('Neplatný měsíc.');
        const rows = await env.DB.prepare(`SELECT id,date,time_from,time_to,name,phone,email,note FROM reservations WHERE substr(date,1,7)=? ORDER BY date,time_from`).bind(month).all();
        return json({ reservations: rows.results || [], admin: await isAdmin(request, env) });
      }

      if (url.pathname === '/api/reservations' && request.method === 'POST') {
        const r = await parseReservation(request);
        if (await conflict(env, r.date, r.time_from, r.time_to)) return bad('Tento čas se překrývá s jinou rezervací.', 409);
        await env.DB.prepare(`INSERT INTO reservations(date,time_from,time_to,name,phone,email,note) VALUES(?,?,?,?,?,?,?)`).bind(r.date,r.time_from,r.time_to,r.name,r.phone,r.email,r.note).run();
        return json({ ok: true }, 201);
      }

      const m = url.pathname.match(/^\/api\/reservations\/(\d+)$/);
      if (m && request.method === 'PUT') {
        if (!await isAdmin(request, env)) return bad('Pouze administrátor může rezervaci upravit.', 403);
        const id = Number(m[1]), r = await parseReservation(request);
        if (await conflict(env, r.date, r.time_from, r.time_to, id)) return bad('Tento čas se překrývá s jinou rezervací.', 409);
        await env.DB.prepare(`UPDATE reservations SET date=?,time_from=?,time_to=?,name=?,phone=?,email=?,note=?,updated_at=datetime('now') WHERE id=?`).bind(r.date,r.time_from,r.time_to,r.name,r.phone,r.email,r.note,id).run();
        return json({ ok: true });
      }
      if (m && request.method === 'DELETE') {
        if (!await isAdmin(request, env)) return bad('Pouze administrátor může rezervaci smazat.', 403);
        await env.DB.prepare(`DELETE FROM reservations WHERE id=?`).bind(Number(m[1])).run();
        return json({ ok: true });
      }

      if (url.pathname === '/api/admin/login' && request.method === 'POST') {
        const { username = '', password = '' } = await request.json();
        if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return bad('Admin přihlášení není nakonfigurované.', 500);
        if (String(username) !== env.ADMIN_USERNAME || String(password) !== env.ADMIN_PASSWORD) return bad('Nesprávné uživatelské jméno nebo heslo.', 401);
        const token = await sessionToken(env);
        return json({ ok: true }, 200, { 'set-cookie': `zasedacka_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` });
      }
      if (url.pathname === '/api/admin/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': 'zasedacka_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return bad(e?.message || 'Chyba serveru.', 500);
    }
  }
};
