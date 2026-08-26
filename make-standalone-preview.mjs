import fs from 'node:fs';

const source = fs.readFileSync(new URL('./src/index.js', import.meta.url), 'utf8');
const match = source.match(/const HTML = `([\s\S]*?)`;\n\nexport default/);
if (!match) throw new Error('HTML aplikace nebylo nalezeno.');

const localApi = String.raw`
const PREVIEW_KEY='zasedacka_preview_reservations';
const PREVIEW_ADMIN_KEY='zasedacka_preview_admin';
function previewRows(){try{return JSON.parse(localStorage.getItem(PREVIEW_KEY)||'[]')}catch{return []}}
function savePreviewRows(rows){localStorage.setItem(PREVIEW_KEY,JSON.stringify(rows))}
function previewAdmin(){return sessionStorage.getItem(PREVIEW_ADMIN_KEY)==='1'}
async function api(url,opt={}){
  const method=opt.method||'GET', rows=previewRows();
  if(url.startsWith('/api/reservations?')){
    const month=new URL(url,'https://preview.local').searchParams.get('month');
    return {reservations:rows.filter(r=>r.date.startsWith(month)),admin:previewAdmin()};
  }
  if(url==='/api/reservations'&&method==='POST'){
    const body=JSON.parse(opt.body||'{}');
    if(rows.some(r=>r.date===body.date&&r.time_from<body.time_to&&r.time_to>body.time_from))throw new Error('Tento čas se překrývá s jinou rezervací.');
    rows.push({id:Date.now(),...body}); savePreviewRows(rows); return {ok:true};
  }
  const reservationMatch=url.match(/^\/api\/reservations\/(\d+)$/);
  if(reservationMatch&&method==='PUT'){
    if(!previewAdmin())throw new Error('Pouze administrátor může rezervaci upravit.');
    const id=Number(reservationMatch[1]), body=JSON.parse(opt.body||'{}'), index=rows.findIndex(r=>r.id===id);
    if(rows.some(r=>r.id!==id&&r.date===body.date&&r.time_from<body.time_to&&r.time_to>body.time_from))throw new Error('Tento čas se překrývá s jinou rezervací.');
    if(index<0)throw new Error('Rezervace nebyla nalezena.');
    rows[index]={id,...body}; savePreviewRows(rows); return {ok:true};
  }
  if(reservationMatch&&method==='DELETE'){
    if(!previewAdmin())throw new Error('Pouze administrátor může rezervaci smazat.');
    savePreviewRows(rows.filter(r=>r.id!==Number(reservationMatch[1]))); return {ok:true};
  }
  if(url==='/api/admin/login'){
    const body=JSON.parse(opt.body||'{}');
    if(body.username!=='admin'||body.password!=='admin')throw new Error('Nesprávné uživatelské jméno nebo heslo.');
    sessionStorage.setItem(PREVIEW_ADMIN_KEY,'1'); return {ok:true};
  }
  if(url==='/api/admin/logout'){sessionStorage.removeItem(PREVIEW_ADMIN_KEY);return {ok:true}}
  throw new Error('Tato funkce není v náhledu dostupná.');
}`;

let html = match[1]
  .replace("async function api(url,opt){const r=await fetch(url,{headers:{'content-type':'application/json'},...opt});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Něco se nepovedlo.');return j}", localApi)
  .replace('<p>Rezervační kalendář zasedací místnosti</p>', '<p>Rezervační kalendář zasedací místnosti · lokální náhled</p>');

fs.writeFileSync(new URL('./zasedacka-nahled.html', import.meta.url), html);
