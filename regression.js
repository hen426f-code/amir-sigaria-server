/* חבילת בדיקות מאוחדת. הרצה: node regression.js */
const {JSDOM}=require('jsdom'); const fs=require('fs');
const crypto=require('crypto').webcrypto;
const FILE=process.argv[2]||'/home/claude/verify2.html';
const html=fs.readFileSync(FILE,'utf8');
const boot=(url='https://x.test/')=>new JSDOM(html,{runScripts:'dangerously',url,pretendToBeVisual:true,
  beforeParse(w){Object.defineProperty(w,'crypto',{value:crypto,configurable:true});
                 Object.defineProperty(w,'isSecureContext',{value:true,configurable:true});}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const chk=(name,cond,extra='')=>{ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name+(extra?'  '+extra:''));} };

(async()=>{
 const dom=boot(); const w=dom.window; await wait(2000);
 const d=w.document; w.confirm=()=>true; w.alert=()=>{};
 let opened=null; w.open=u=>{opened=u};
 const errs=[]; w.addEventListener('error',e=>errs.push(e.message));

 console.log('\n== שלמות הדף ==');
 chk('אין שגיאות בטעינה', errs.length===0, errs.join('; '));
 chk('הקטלוג בדף הבית נטען', d.querySelectorAll('#productsGrid .deal').length>0);
 chk('לכל מוצר בקטלוג יש מחיר וטעמים', [...d.querySelectorAll('#productsGrid .deal')].every(c=>c.querySelector('.price')&&c.querySelectorAll('.flav').length>0));
 chk('הלוגו בסרגל', !!d.querySelector('#logoMark img'));
 chk('שער הגיל מופיע', !!d.querySelector('.gate'));

 console.log('\n== כפתורים ומזהים ==');
 const dead=[];
 d.querySelectorAll('[onclick],[onchange]').forEach(el=>{
   const code=(el.getAttribute('onclick')||'')+';'+(el.getAttribute('onchange')||'');
   [...code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].forEach(m=>{
     const fn=m[1];
     if(['if','for','while','return','confirm','alert','querySelector'].includes(fn))return;
     if(typeof w[fn]!=='function') dead.push(fn);
   });
 });
 chk('כל הכפתורים מחוברים לפונקציה קיימת', dead.length===0, [...new Set(dead)].join(', '));
 const js=[...d.querySelectorAll('script')].map(s=>s.textContent).join('');
 const missing=[...new Set([...js.matchAll(/getElementById\("([^"]+)"\)/g)].map(m=>m[1]))].filter(id=>!d.getElementById(id));
 chk('כל המזהים שהקוד מחפש קיימים', missing.length===0, missing.join(', '));
 const css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
 const used=new Set(); d.querySelectorAll('#adminOverlay *').forEach(el=>el.classList.forEach(c=>used.add(c)));
 const noStyle=[...used].filter(c=>!css.includes('.'+c));
 chk('לכל מחלקה בפאנל יש עיצוב', noStyle.length===0, noStyle.join(', '));


 console.log('\n== שלמות מבנה הדף ==');
 // מבנה שבור לא נתפס בבדיקות רגילות, כי מנוע הבדיקה מתקן אותו אוטומטית.
 // לכן נבדק כאן ישירות על הקוד המקורי של הדף.
 const rawHtml = fs.readFileSync(FILE,'utf8');
 const bodyRaw = rawHtml.slice(rawHtml.indexOf('<body'), rawHtml.lastIndexOf('</body>'));
 const opensN = (bodyRaw.match(/<(?:div|aside|section|main|header|footer|nav|article)\b/g)||[]).length;
 const closesN = (bodyRaw.match(/<\/(?:div|aside|section|main|header|footer|nav|article)>/g)||[]).length;
 chk('תגיות הפתיחה והסגירה מאוזנות', opensN===closesN, opensN+' פתוחים מול '+closesN+' סגורים');
 const ov = d.getElementById('adminOverlay');
 chk('תפריט הלשוניות בתוך הפאנל', !!ov.querySelector('.adminLayout .side [data-page]'));
 chk('אזור התוכן בתוך הפאנל', !!ov.querySelector('.adminLayout > section .adminPage'));
 chk('סרגל הפאנל בתוך הפאנל', !!ov.querySelector('.adminTop .adminTopBtns'));
 chk('סימון החיבור בתוך הסרגל', !!ov.querySelector('.adminTop #serverState'));

 console.log('\n== פאנל הניהול ==');
 w.openAdmin(); await wait(250);
 chk('הפאנל נפתח', !d.getElementById('adminOverlay').classList.contains('hidden'));
 const tabs=[...d.querySelectorAll('.side [data-page]')];
 let allOk=true;
 for(const b of tabs){
   b.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(50);
   const p=d.getElementById('page-'+b.dataset.page);
   if(!p||!p.classList.contains('active')) allOk=false;
 }
 chk(`כל ${tabs.length} הלשוניות נפתחות`, allOk);

 console.log('\n== עריכת מוצר בקטלוג ==');
 const pid=d.querySelector('#adminProducts .iconBtn').getAttribute('onclick').match(/'([^']+)'/)[1];
 w.editProduct(pid); await wait(200);
 const probe={pName:'שם בדיקה',pSku:'SKU-T',pPrice:'77',pOldPrice:'99',pBrand:'מותג',pStock:'5',pBadge:'תווית',pDesc:'תיאור'};
 for(const [k,v] of Object.entries(probe)) d.getElementById(k).value=v;
 const sel=d.getElementById('pCategory');
 const nc=[...sel.options].map(o=>o.value).find(v=>v!==sel.value); sel.value=nc;
 await w.saveProduct(); await wait(400);
 w.editProduct(pid); await wait(250);
 let bad=Object.entries(probe).filter(([k,v])=>String(d.getElementById(k).value)!==String(v)&&Number(d.getElementById(k).value)!==Number(v)).map(([k])=>k);
 if(d.getElementById('pCategory').value!==nc) bad.push('pCategory');
 chk('כל שדות המוצר נשמרים', bad.length===0, bad.join(', '));

 console.log('\n== עריכת פריט במחירון ==');
 const did=d.querySelector('#adminDeals .iconBtn').getAttribute('onclick').match(/'([^']+)'/)[1];
 w.editDeal(did); await wait(200);
 const dprobe={dName:'פריט',dSku:'D-T',dOldPrice:'200',dPrice:'150',dDesc:'תיאור',dBadge:'תווית',dCategory:'סוג',dBrand:'מותג',dStock:'3'};
 for(const [k,v] of Object.entries(dprobe)){const el=d.getElementById(k); if(el) el.value=v;}
 d.getElementById('newDealFlavor').value='מנטה, ענבים'; w.addDealFlavor();
 await w.saveDeal(); await wait(400);
 w.editDeal(did); await wait(250);
 const dbad=Object.entries(dprobe).filter(([k,v])=>{const el=d.getElementById(k); return !el||(String(el.value)!==String(v)&&Number(el.value)!==Number(v));}).map(([k])=>k);
 chk('כל שדות פריט המחירון נשמרים', dbad.length===0, dbad.join(', '));
 chk('הטעמים נשמרים בפריט מחירון', d.querySelectorAll('#dealFlavorEditor .flavRow').length>=2);
 chk('יש תצוגה מקדימה לתמונה', !!d.getElementById('dImgPreview'));
 w.closeDealModal(); w.closeAdmin(); await wait(150);

 console.log('\n== עגלה ==');
 w.clearCart(); await wait(150);
 w.openDeals(); await wait(250);
 // הקטלוג בדף הבית מוסתר, ולכן ההוספה נבדקת מעמוד המחירון
 let cc=d.querySelector('#productsGrid .deal');
 const hasFlav=cc.querySelectorAll('.flav:not(.out)').length>0;
 if (hasFlav) cc.querySelector('.flav:not(.out)').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(150);
 d.querySelector('#productsGrid .deal .cardBtns .btn.primary').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(300);
 chk('העגלה נפתחת בהוספה', d.getElementById('cartPanel').classList.contains('open'));
 chk('המונה מתעדכן', d.querySelector('.cartCount').textContent==='1');
 const qtyBtns=d.querySelectorAll('.cartLine .qty button');
 if (qtyBtns.length>1) qtyBtns[1].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(180);
 chk('הגדלת כמות עובדת', (d.querySelector('.cartLine .qty span')||{}).textContent==='2');
 w.pickWhen('later'); await wait(80);
 chk('הזמנה עתידית פותחת שדות תאריך', !d.getElementById('whenFields').classList.contains('hidden'));
 w.pickPay('ביט'); w.submitOrder(); await wait(150);
 chk('ההזמנה נשלחת עם פרטים', !!opened && decodeURIComponent(opened).includes('אמצעי תשלום'));
 chk('העגלה נשמרת בין טעינות', !!w.localStorage.getItem('hameashenet_cart_v1'));
 w.clearCart(); await wait(150); w.closeCart(); await wait(100);

 console.log('\n== עמודים נוספים ==');
 w.openContact(); await wait(150);
 chk('עמוד הפנייה נפתח', d.body.classList.contains('showContact'));
 opened=null; w.sendContact(); await wait(100);
 chk('פנייה ריקה נחסמת', opened===null);
 w.openTerms(); await wait(150);
 chk('התקנון נפתח', d.body.classList.contains('showTerms'));
 chk('לתקנון יש 14 סעיפים', d.querySelectorAll('#terms .legalBody h2').length===14);
 w.openDeals(); await wait(150);
 chk('קישור המחירון מוביל לקטלוג שבדף הבית', !d.body.classList.contains('showDeals') && d.querySelectorAll('#productsGrid .deal').length>0);



 console.log('\n== יצירה ומחיקה בפאנל ==');
 w.openAdmin(); await wait(200);
 const before=d.querySelectorAll('#adminProducts tr').length;
 let crashed=null;
 try { w.openProductModal(); } catch(e){ crashed=e.message; }
 await wait(200);
 chk('חלון "מוצר חדש" נפתח', !crashed && d.getElementById('productModal').classList.contains('open'), crashed||'');
 d.getElementById('pName').value='מוצר בדיקה';
 d.getElementById('pSku').value='REG-1';
 d.getElementById('pPrice').value='55';
 await w.saveProduct(); await wait(450);
 chk('המוצר החדש נוסף', d.querySelectorAll('#adminProducts tr').length===before+1);
 chk('המוצר נשמר ברשימה הישנה', [...d.querySelectorAll('#adminProducts b')].some(b=>b.textContent.includes('מוצר בדיקה')));
 const dupId=[...d.querySelectorAll('#adminProducts .iconBtn')].find(b=>b.getAttribute('onclick').includes('duplicate')).getAttribute('onclick').match(/'([^']+)'/)[1];
 const n1=d.querySelectorAll('#adminProducts tr').length;
 await w.duplicateProduct(dupId); await wait(400);
 chk('שכפול מוצר עובד', d.querySelectorAll('#adminProducts tr').length===n1+1);
 const delId=[...d.querySelectorAll('#adminProducts .iconBtn')].find(b=>b.getAttribute('onclick').includes('deleteProduct')).getAttribute('onclick').match(/'([^']+)'/)[1];
 const n2=d.querySelectorAll('#adminProducts tr').length;
 await w.deleteProduct(delId); await wait(400);
 chk('מחיקת מוצר עובדת', d.querySelectorAll('#adminProducts tr').length===n2-1);
 const c1=d.getElementById('dashCats').textContent;
 d.getElementById('newCat').value='קטגוריית רגרסיה';
 await w.addCategory(); await wait(400);
 chk('הוספת קטגוריה עובדת', Number(d.getElementById('dashCats').textContent)===Number(c1)+1);
 chk('הקטגוריה נכנסת לרשימת הבחירה', [...d.getElementById('pCategory').options].some(o=>o.value==='קטגוריית רגרסיה'));
 await w.deleteCategory('קטגוריית רגרסיה'); await wait(400);
 chk('מחיקת קטגוריה עובדת', Number(d.getElementById('dashCats').textContent)===Number(c1));

 console.log('\n== שמירת הגדרות ==');
 w.switchAdmin('business', d.querySelector('[data-page=business]')); await wait(120);
 d.getElementById('setBusinessName').value='שם בדיקה';
 await w.saveBusiness(); await wait(400);
 chk('פרטי העסק נשמרים', d.getElementById('brandNameTop').textContent==='שם בדיקה');
 w.switchAdmin('homepage', d.querySelector('[data-page=homepage]')); await wait(120);
 d.getElementById('setHeroTitle').value='כותרת בדיקה';
 await w.saveHomepage(); await wait(400);
 chk('דף הבית נשמר', d.getElementById('heroTitle').textContent==='כותרת בדיקה');
 w.switchAdmin('deals', d.querySelector('[data-page=deals]')); await wait(120);
 d.getElementById('setAccTitle').value='אביזרים בדיקה';
 await w.saveDealsSettings(); await wait(400);
 chk('שמות העמודים נשמרים', d.getElementById('accTitle').textContent==='אביזרים בדיקה');
 w.closeAdmin(); await wait(150);


 console.log('\n== טעם אחד לכל שורה ==');
 w.openAdmin(); await wait(200);
 w.switchCollection('deals'); await wait(120);
 const fid=d.querySelector('#adminDeals .iconBtn').getAttribute('onclick').match(/'([^']+)'/)[1];
 w.editDeal(fid); await wait(200);
 await w.saveDeal(); await wait(400);
 w.closeAdmin(); await wait(150);
 w.clearCart(); await wait(150);
 w.goCatalog(); await wait(250);
 let card=d.querySelector('#productsGrid .deal');
 chk('צ׳יפים של טעמים מוצגים בכרטיס', card.querySelectorAll('.flav').length>=3);
 card.querySelector('.cardBtns .btn.primary').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(250);
 chk('הוספה בלי טעם נחסמת', d.querySelectorAll('.cartLine').length===0);
 let chips=[...d.querySelector('#productsGrid .deal').querySelectorAll('.flav:not(.out)')];
 chips[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(120);
 chips=[...d.querySelector('#productsGrid .deal').querySelectorAll('.flav:not(.out)')];
 chips[1].dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(120);
 chk('בחירה שנייה מחליפה ולא מצטברת', d.querySelectorAll('#productsGrid .deal .flav.on').length===1);
 d.querySelector('#productsGrid .deal .cardBtns .btn.primary').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(300);
 chk('הוספה עם טעם יוצרת שורה', d.querySelectorAll('.cartLine').length===1);
 w.closeCart(); await wait(100); w.openDeals(); await wait(200);
 chips=[...d.querySelector('#productsGrid .deal').querySelectorAll('.flav:not(.out)')];
 chips[1].dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(120);
 d.querySelector('#productsGrid .deal .cardBtns .btn.primary').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(300);
 chk('אותו טעם מגדיל כמות באותה שורה', d.querySelectorAll('.cartLine').length===1 && d.querySelector('.cartLine .qty span').textContent==='2');
 w.closeCart(); await wait(100); w.openDeals(); await wait(200);
 chips=[...d.querySelector('#productsGrid .deal').querySelectorAll('.flav:not(.out)')];
 chips[2].dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(120);
 d.querySelector('#productsGrid .deal .cardBtns .btn.primary').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(300);
 chk('טעם אחר פותח שורה חדשה', d.querySelectorAll('.cartLine').length===2);
 let ordered=null; const oldOpen=w.open; w.open=u=>{ordered=u};
 w.submitOrder(); await wait(150); w.open=oldOpen;
 const msg=ordered?decodeURIComponent(ordered.split('text=')[1]):'';
 chk('אין שורה עם שני טעמים בסיכום', !!msg && !/טעם:[^\n]*,/.test(msg));
 w.clearCart(); await wait(150);

 console.log('\n== הסתרת הקטלוג שבדף הבית ==');
 chk('הקטלוג גלוי כברירת מחדל', !d.body.classList.contains('hideCatalog'));
 w.openAdmin(); await wait(150);
 w.switchAdmin('deals', d.querySelector('[data-page=deals]')); await wait(120);
 const tg=d.getElementById('setCatalogVisible');
 chk('מתג ההסתרה קיים בפאנל', !!tg);
 chk('המתג משקף את המצב', tg && tg.checked===true);
 tg.checked=false; await w.toggleCatalogVisible(); await wait(400);
 chk('כיבוי המתג מסתיר את הקטלוג', d.body.classList.contains('hideCatalog'));
 d.getElementById('setCatalogVisible').checked=true; await w.toggleCatalogVisible(); await wait(400);
 chk('הפעלה מחזירה אותו', !d.body.classList.contains('hideCatalog'));
 chk('הנתונים נשמרו ולא נמחקו', d.querySelectorAll('#adminProducts tr').length>10);
 w.closeAdmin(); await wait(150);

 console.log('\n== תפריט שלושת הפסים ==');
 chk('כפתור התפריט קיים', !!d.getElementById('menuBtn'));
 w.openMenu(); await wait(180);
 chk('התפריט נפתח', d.getElementById('menuPanel').classList.contains('open'));
 const links=[...d.querySelectorAll('#menuLinks button')].map(b=>b.textContent);
 chk('התפריט מכיל את כל הלשוניות', links.length>=6, links.join(' | '));
 chk('התפריט נבנה מהנתונים', links.includes('אביזרי סלולר')||links.includes('תקנון ותנאי שימוש'), links.join(' | '));
 d.querySelectorAll('#menuLinks button')[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 await wait(180);
 chk('בחירה מהתפריט סוגרת אותו', !d.getElementById('menuPanel').classList.contains('open'));





 console.log('\n== אזהרות בריאות ==');
 chk('פס אזהרה קבוע בראש האתר', !!d.querySelector('.topWarn'));
 chk('אזהרה בכל מקטע מכירה', d.querySelectorAll('.warnBar').length>=3, 'נמצאו '+d.querySelectorAll('.warnBar').length);
 chk('האזהרה מציינת ניקוטין וגיל', /ניקוטין/.test(d.body.textContent) && /21/.test(d.body.textContent));

 console.log('\n== נגישות ==');
 chk('כפתור הגדרות נגישות', !!d.getElementById('a11yBtn'));
 chk('קישור דילוג לתוכן', !!d.querySelector('.skipLink'));
 chk('עמוד הצהרת נגישות', !!d.getElementById('accessibility'));
 chk('אזורי תוכן מוגדרים', ['banner','navigation','main','contentinfo'].every(r=>!!d.querySelector('[role='+r+']')));
 w.setA11y('font+'); await wait(60);
 chk('הגדלת טקסט פועלת', d.documentElement.style.getPropertyValue('--a11yScale')==='1.1');
 w.setA11y('contrast'); await wait(60);
 chk('ניגודיות גבוהה פועלת', d.body.classList.contains('a11yContrast'));
 chk('מצב הכפתור מסומן לקורא מסך', d.querySelector('[data-a11y=contrast]').getAttribute('aria-pressed')==='true');
 w.setA11y('reset'); await wait(60);
 chk('איפוס מחזיר למצב רגיל', !d.body.classList.contains('a11yContrast'));
 const ch=d.querySelector('.flav:not(.out)');
 chk('בחירת טעם נגישה במקלדת', !!ch && ch.getAttribute('tabindex')==='0' && ch.getAttribute('role')==='radio');

 console.log('\n== מבצע 2 ב־100 ==');
 w.openAdmin(); await wait(200);
 w.switchAdmin('deals', d.querySelector('[data-page=deals]')); await wait(120);
 w.switchCollection('deals'); await wait(180);
 const tags=[...d.querySelectorAll('.comboTag')];
 chk('עמודת המבצע קיימת בטבלה', tags.length>0);
 const cids=tags.slice(0,2).map(t=>t.getAttribute('onclick').match(/'([^']+)'/)[1]);
 for(const id of cids){ await w.toggleCombo(id); await wait(320); }
 w.closeAdmin(); await wait(180);
 chk('סימון ידני מוסיף לעמוד המבצע', d.querySelectorAll('#comboGrid .deal').length===2);
 w.clearCart(); await wait(150);
 for(let i=0;i<2;i++){
   const cs=[...d.querySelectorAll('#comboGrid .deal')];
   const cp=cs[i].querySelector('.flav:not(.out)');
   if(cp) cp.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   await wait(110);
   [...d.querySelectorAll('#comboGrid .deal')][i].querySelector('.cardBtns .btn.primary').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
   await wait(280);
   w.closeCart(); await wait(90);
 }
 w.openCart(); await wait(220);
 const br=JSON.parse(w.eval('JSON.stringify(comboBreakdown())'));
 chk('זוג מחויב במחיר המבצע', br.pairs===1 && br.comboPrice===100);
 chk('המבצע מוזיל ואינו מייקר', w.eval('cartTotal()') <= w.eval('cartSubtotal()'));
 chk('החיסכון מוצג ללקוח', !!d.querySelector('.comboSave'));

 console.log('\n== מקור ההזמנה ==');
 chk('כל שורה בעגלה מציינת קטלוג', [...d.querySelectorAll('.cartLine')].every(l=>!!l.querySelector('.cartSrc')));
 let ord=null; const oo=w.open; w.open=u=>{ord=u};
 w.submitOrder(); await wait(180); w.open=oo;
 const om=ord?decodeURIComponent(ord.split('text=')[1]):'';
 chk('ההזמנה מקובצת לפי קטלוג', /◆/.test(om), om.slice(0,60));
 chk('סיכום המבצע מופיע בהזמנה', /מבצע 2 ב־100/.test(om));
 chk('סה״כ לתשלום מופיע', /סה״כ לתשלום/.test(om));
 w.clearCart(); await wait(150); w.closeCart(); await wait(100);


 console.log('\n== עמוד הצעצועים ==');
 chk('העמוד קיים', !!d.getElementById('toys'));
 chk('אינו בזרימת דף הבית', !d.getElementById('toys').closest('main'));
 w.openToys(); await wait(250);
 chk('נפתח כעמוד עצמאי', d.body.classList.contains('showToys'));
 chk('יש לו באנר משלו', !!d.querySelector('.toysHero h1'));
 chk('יש אזור קטגוריות', !!d.getElementById('toysCatGrid'));
 chk('יש חיפוש', !!d.getElementById('toysSearch'));
 chk('עיצוב נפרד מהאתר', !!d.querySelector('.toysPage .tBtnMain'));
 w.closeToys(); await wait(150);
 chk('סגירה מחזירה לאתר', !d.body.classList.contains('showToys'));

 console.log('\n== כרטיסי מוצר במסך צר ==');
 const cssAll=[...d.querySelectorAll('style')].map(x=>x.textContent).join('').replace(/\s+/g,'');
 chk('שורת המחיר והכפתור עוטפת', /\.toyFoot\{[^}]*flex-wrap:wrap/.test(cssAll) && /\.accFoot\{[^}]*flex-wrap:wrap/.test(cssAll));
 chk('במסך צר הכפתור עובר לשורה נפרדת', /@media\(max-width:760px\)\{[^@]*flex-direction:column/.test(cssAll));
 chk('הכפתור ברוחב מלא ולא נחתך', /\.toyAdd,\.accAdd\{width:100%/.test(cssAll));
 chk('שטח המגע בכפתור תקין', /\.toyAdd\{[^}]*min-height:44px/.test(cssAll));

 console.log('\n== מבנה דף הבית ==');
 const order=[...d.querySelectorAll('main > section')].map(x=>x.id).filter(Boolean);
 chk('סדר המקטעים נכון', JSON.stringify(order.slice(0,5))===JSON.stringify(['catalog','combo','business','accessories','categories']), order.join(' > '));
 chk('הבאנר עם תמונת המכשיר', !!d.getElementById('heroDevice'));
 chk('רקע התלת מימד קיים', !!d.getElementById('siteBg'));
 w.openMenu(); await wait(200);
 const labels=[...d.querySelectorAll('#menuLinks button')].map(b=>b.textContent.replace('ריק','').trim());
 chk('תפריט הצד בסדר הנכון', labels[0]==='דף הבית' && labels[2]==='מבצע 2 ב־100' && labels[3]==='קטלוג לעסקים'
     && labels[4].includes('אביזר') && labels[5]==='צעצועים' && labels[6]==='קטגוריות' && labels[7]==='אודות'
     && labels[9]==='תקנון ותנאי שימוש' && labels[10]==='הצהרת נגישות', labels.join(' | '));
 w.closeMenu(); await wait(120);

 console.log('\n== רצועת הכפתורים בטלפון ==');
 const mb=[...d.querySelectorAll('.mobileBar button')];
 
 const tg2=mb.map(b=>b.getAttribute('onclick'));
 chk('אין שני כפתורים לאותו יעד', new Set(tg2).size===tg2.length, tg2.join(' | '));
 chk('יש כפתור לקטלוג לעסקים', tg2.some(x=>x.includes('openBiz')));
 mb[1].dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(250);
 chk('הכפתור מוביל למקטע הקטלוג לעסקים', mb[1].getAttribute('onclick').includes('openBiz'));
 const css2=[...d.querySelectorAll('style')].map(x=>x.textContent).join('').replace(/\s+/g,'');
 chk('הרצועה מחולקת לשלוש עמודות שוות', /\.mobileBar\{[^}]*grid-template-columns:repeat\(3,1fr\)/.test(css2));
 const barRules=css2.match(/\.mobileBarbutton,\.mobileBara\{[^}]*\}/g)||[];
 chk('אין כלל שדורס את הגובה', !barRules.slice(1).some(r=>/padding|min-height/.test(r)));
 chk('לשלושת הכפתורים אותו צבע', !/\.mobileBarbutton:first-child\{/.test(css2) && !/\.mobileBara\.wa\{/.test(css2));

 await wait(100);

 console.log('\n== קטלוג לעסקים ==');
 w.openBiz(); await wait(250);
 const biz=[...d.querySelectorAll('#bizGrid .deal')];
 chk('המקטע קיים בדף הבית', !!d.getElementById('business') && d.getElementById('business').closest('main'));
 chk('17 מוצרים בקטלוג לעסקים', biz.length===17, 'נמצאו '+biz.length);
 chk('לכולם יש תמונה', biz.every(c=>!!c.querySelector('.pic img')));
 chk('לכולם יש מחיר', biz.every(c=>!!c.querySelector('.price')));
 chk('לכולם יש טעמים', biz.every(c=>c.querySelectorAll('.flav').length>0));
 chk('תווית המוצר הנמכר מוצגת', !!d.querySelector('#bizGrid .badge'));
 chk('לא דלף לקטלוג דף הבית', d.querySelectorAll('#productsGrid .deal').length===16);
 const navs=[...d.querySelectorAll('.nav a')].map(a=>a.textContent);
 chk('אין שני קישורים לאותו עמוד', new Set(navs).size===navs.length, navs.join(' | '));
 chk('קישור לקטלוג לעסקים קיים', navs.includes('קטלוג לעסקים'));
 await wait(100);

 console.log('\n== אביזרי סלולר ==');
 w.openAdmin(); await wait(200);
 w.switchCollection('accessories'); await wait(150);
 w.openDealModal(); await wait(150);
 chk('בחירת עמוד קיימת בחלון הפריט', !!d.getElementById('dCollection'));
 d.getElementById('dName').value='מטען מהיר 30W';
 d.getElementById('dSku').value='CH-30';
 d.getElementById('dOldPrice').value='120';
 d.getElementById('dPrice').value='89';
 d.getElementById('dDesc').value='מטען קיר מהיר';
 d.getElementById('dCollection').value='accessories';
 await w.saveDeal(); await wait(400);
 w.closeAdmin(); await wait(120);
 w.openAcc(); await wait(200);
 chk('מקטע האביזרים קיים בדף הבית', !!d.getElementById('accessories') && d.getElementById('accessories').closest('main'));
 const accCards=d.querySelectorAll('#accGrid .accCard');
 chk('הפריט החדש מופיע בעמוד האביזרים', accCards.length===1, 'נמצאו '+accCards.length);
 chk('הפריט לא דלף לעמוד המחירון', d.querySelectorAll('#productsGrid .deal').length===16);
 chk('המבצע מחושב', (d.querySelector('#accGrid .accPct')||{}).textContent==='26%-', (d.querySelector('#accGrid .accPct')||{}).textContent);
 chk('אפשר להוסיף אביזר לעגלה', !!d.querySelector('#accGrid .accAdd'));

 console.log(`\n=== ${pass} עברו, ${fail} נכשלו ===`);
 process.exit(fail?1:0);
})();
