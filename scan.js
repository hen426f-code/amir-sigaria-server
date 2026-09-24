/* סריקת באגים מקיפה. הרצה: node scan.js */
const {JSDOM}=require('jsdom'); const fs=require('fs');
const crypto=require('crypto').webcrypto;
const FILE=process.argv[2]||'/home/claude/verify2.html';
const raw=fs.readFileSync(FILE,'utf8');
const dom=new JSDOM(raw,{runScripts:'dangerously',url:'https://x.test/',pretendToBeVisual:true,
  beforeParse(w){Object.defineProperty(w,'crypto',{value:crypto,configurable:true});
                 Object.defineProperty(w,'isSecureContext',{value:true,configurable:true});}});
const w=dom.window; const wait=ms=>new Promise(r=>setTimeout(r,ms));
const issues=[];
const bug=(sev,area,msg)=>issues.push({sev,area,msg});

(async()=>{
 await wait(2600);
 const d=w.document;
 const runtimeErrors=[];
 w.addEventListener('error',e=>runtimeErrors.push(e.message));
 const origErr=console.error; console.error=(...a)=>runtimeErrors.push(a.join(' '));
 w.confirm=()=>true;
 const alerts=[]; w.alert=m=>alerts.push(String(m));
 let opened=null; w.open=u=>{opened=u};

 /* ---------- 1. מבנה הדף ---------- */
 const body=raw.slice(raw.indexOf('<body'), raw.lastIndexOf('</body>'));
 const o=(body.match(/<(?:div|aside|section|main|header|footer|nav|article)\b/g)||[]).length;
 const c=(body.match(/<\/(?:div|aside|section|main|header|footer|nav|article)>/g)||[]).length;
 if(o!==c) bug('חמור','מבנה',`תגיות לא מאוזנות: ${o} פתוחות מול ${c} סגורות`);

 const ids={};
 d.querySelectorAll('[id]').forEach(el=>{ ids[el.id]=(ids[el.id]||0)+1; });
 Object.entries(ids).filter(([,n])=>n>1).forEach(([id,n])=>bug('חמור','מבנה',`מזהה כפול "${id}" מופיע ${n} פעמים`));

 /* ---------- 2. כפתורים ומזהים ---------- */
 const dead=new Set();
 d.querySelectorAll('[onclick],[onchange],[oninput],[onkeydown]').forEach(el=>{
   const code=['onclick','onchange','oninput','onkeydown'].map(a=>el.getAttribute(a)||'').join(';');
   [...code.matchAll(/(?:^|[;{(\s])([A-Za-z_$][\w$]*)\s*\(/g)].forEach(m=>{
     const fn=m[1];
     if(['if','for','while','return','confirm','alert','Number','String','parseInt','event'].includes(fn))return;
     if(/^(document|window|this)$/.test(fn))return;
     if(typeof w[fn]!=='function' && !/^(querySelector|getElementById|preventDefault)$/.test(fn)) dead.add(fn);
   });
 });
 dead.forEach(fn=>bug('חמור','כפתורים',`פונקציה שלא קיימת: ${fn}()`));

 const js=[...d.querySelectorAll('script')].map(s=>s.textContent).join('');
 const dynamic=new Set(['pvShareNote','pvMainImg','agPass','agOk','agCancel','agErr','gateYes']);
 [...new Set([...js.matchAll(/getElementById\("([^"]+)"\)/g)].map(m=>m[1]))]
   .filter(id=>!d.getElementById(id) && !dynamic.has(id))
   .forEach(id=>bug('חמור','מזהים',`הקוד מחפש מזהה שאינו קיים: ${id}`));

 /* ---------- 3. עיצוב חסר ---------- */
 const css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
 const used=new Set();
 d.querySelectorAll('*').forEach(el=>el.classList.forEach(x=>used.add(x)));
 [...used].filter(x=>!css.includes('.'+x)).forEach(x=>bug('בינוני','עיצוב',`מחלקה ללא כללי עיצוב: .${x}`));

 /* ---------- 4. נגישות ---------- */
 let noAlt=0;
 d.querySelectorAll('img').forEach(im=>{ if(!im.hasAttribute('alt')) noAlt++; });
 if(noAlt) bug('בינוני','נגישות',`${noAlt} תמונות ללא טקסט חלופי`);
 let nameless=0;
 d.querySelectorAll('button').forEach(b=>{
   const t=(b.textContent||'').trim();
   if(!t && !b.getAttribute('aria-label') && !b.getAttribute('title')) nameless++;
 });
 if(nameless) bug('בינוני','נגישות',`${nameless} כפתורים ללא שם נגיש`);
 d.querySelectorAll('input,select,textarea').forEach(f=>{
   if(f.type==='hidden'||f.type==='file') return;
   const lab=f.id && d.querySelector(`label[for="${f.id}"]`);
   const wrapped=f.closest('label');
   if(!lab && !wrapped && !f.getAttribute('aria-label') && !f.placeholder)
     bug('בינוני','נגישות',`שדה ללא תווית: ${f.id||f.name||f.type}`);
 });

 /* ---------- 5. קישורים פנימיים ---------- */
 d.querySelectorAll('a[href^="#"]').forEach(a=>{
   const h=a.getAttribute('href');
   if(h==='#'||h.startsWith('#p/')) return;
   if(!d.querySelector(h)) bug('בינוני','ניווט',`קישור ליעד שאינו קיים: ${h}`);
 });

 /* ---------- 6. תקינות הנתונים ---------- */
 const items=JSON.parse(w.eval('JSON.stringify(dealsList())'));
 const seen={};
 const validCols=['deals','business','accessories','toys'];
 items.forEach(it=>{
   seen[it.id]=(seen[it.id]||0)+1;
   if(!it.name||!String(it.name).trim()) bug('חמור','נתונים',`פריט ללא שם: ${it.id}`);
   if(!(Number(it.price)>0)) bug('בינוני','נתונים',`פריט ללא מחיר: ${String(it.name).slice(0,28)}`);
   if(!validCols.includes(it.collection||'deals')) bug('חמור','נתונים',`אוסף לא מוכר "${it.collection}" בפריט ${String(it.name).slice(0,24)}`);
   const op=it.oldPrice!==undefined?it.oldPrice:it.old_price;
   if(op && it.price && Number(op)<=Number(it.price))
     bug('בינוני','נתונים',`מחיר קודם אינו גבוה מהנוכחי: ${String(it.name).slice(0,28)}`);
 });
 Object.entries(seen).filter(([,n])=>n>1).forEach(([id,n])=>bug('חמור','נתונים',`מזהה פריט כפול: ${id} (${n})`));
 const noImg=items.filter(i=>!(i.image||i.image_url) && !(i.images&&i.images.length)).length;
 if(noImg) bug('נמוך','נתונים',`${noImg} פריטים ללא תמונה`);
 const noDesc=items.filter(i=>!(i.desc||i.description)).length;
 if(noDesc) bug('נמוך','נתונים',`${noDesc} פריטים ללא תיאור`);
 const ext=items.filter(i=>String(i.image||i.image_url||'').startsWith('http')).length;
 if(ext) bug('נמוך','נתונים',`${ext} תמונות מוצבעות לשרת חיצוני (תלות באתר אחר)`);

 /* ---------- 7. מעבר בין כל העמודים ---------- */
 const pages=[['openCombo','combo'],['openBiz','business'],['openAcc','accessories'],
              ['openToys','toys'],['openContact','contact'],['openTerms','terms'],
              ['openAccessibility','accessibility']];
 for(const [fn,id] of pages){
   try{ w[fn](); }catch(e){ bug('חמור','ניווט',`${fn} זרק שגיאה: ${e.message}`); continue; }
   await wait(160);
   if(!d.getElementById(id)) bug('חמור','ניווט',`העמוד ${id} אינו קיים`);
 }
 w.goHome(); await wait(200);

 /* ---------- 8. עגלה ומקרי קצה ---------- */
 w.clearCart(); await wait(120);
 const before=d.querySelectorAll('.cartLine').length;
 try{ w.submitOrder(); }catch(e){ bug('חמור','עגלה',`שליחה בעגלה ריקה זרקה שגיאה: ${e.message}`); }
 if(opened) bug('בינוני','עגלה','אפשר לשלוח הזמנה ריקה');
 opened=null;

 const card=d.querySelector('#productsGrid .deal');
 if(card){
   const chip=card.querySelector('.flav:not(.out)');
   if(chip) chip.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   await wait(110);
   d.querySelector('#productsGrid .deal .cardBtns .btn.primary').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   await wait(260);
   const qtyBtns=d.querySelectorAll('.cartLine .qty button');
   if(qtyBtns.length){
     qtyBtns[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true})); // הפחתה מ-1
     await wait(180);
     if(d.querySelectorAll('.cartLine').length!==0) bug('בינוני','עגלה','הפחתה מכמות 1 לא מסירה את השורה');
   }
 }
 w.clearCart(); await wait(120);

 /* ---------- 9. פאנל הניהול ---------- */
 w.openAdmin(); await wait(220);
 const tabs=[...d.querySelectorAll('.side [data-page]')];
 for(const b of tabs){
   b.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(45);
   const p=d.getElementById('page-'+b.dataset.page);
   if(!p||!p.classList.contains('active')) bug('חמור','פאנל',`הלשונית ${b.dataset.page} לא נפתחת`);
 }
 const skip=/מחק|מחיקה|רוקן|איפוס|התנתק|סגור|🗑/;
 let crashed=0;
 [...d.querySelectorAll('#adminOverlay button')].filter(b=>!skip.test(b.textContent)).forEach(b=>{
   try{ b.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); }catch(e){ crashed++; bug('חמור','פאנל',`כפתור "${b.textContent.trim().slice(0,20)}" קורס: ${e.message}`); }
 });
 w.closeAdmin(); await wait(150);

 /* ---------- 10. שגיאות ריצה ---------- */
 console.error=origErr;
 const envOnly=/scrollTo|createObjectURL|getContext|Not implemented/;
 [...new Set(runtimeErrors)].filter(e=>!envOnly.test(e)).forEach(e=>bug('חמור','ריצה',e.slice(0,120)));
 const badAlerts=alerts.filter(a=>/שגיאה|נכשל/.test(a));
 [...new Set(badAlerts)].forEach(a=>bug('בינוני','ריצה',`הודעת שגיאה: ${a.slice(0,80)}`));

 /* ---------- דוח ---------- */
 const order={'חמור':0,'בינוני':1,'נמוך':2};
 issues.sort((a,b)=>order[a.sev]-order[b.sev]);
 const counts={'חמור':0,'בינוני':0,'נמוך':0};
 issues.forEach(i=>counts[i.sev]++);
 console.log('\n================ דוח סריקה ================');
 console.log(`חמור: ${counts['חמור']}  |  בינוני: ${counts['בינוני']}  |  נמוך: ${counts['נמוך']}\n`);
 let last='';
 issues.forEach(i=>{
   if(i.sev!==last){ console.log(`--- ${i.sev} ---`); last=i.sev; }
   console.log(`  [${i.area}] ${i.msg}`);
 });
 if(!issues.length) console.log('לא נמצאו בעיות.');
})();
