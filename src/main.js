import './styles.css';
import templateHtml from './template.html?raw';
import { initSiteBackground } from './sitebg.js';
import { supabase, exportDataFile, importDataFile, resetToSeed,
         initStore, isServerMode, verifyAdmin, pushToServer, setAdminPass } from './store.js';
import heroPhoto from './assets/images/image copy 3.webp';
import heroBackdrop from './assets/images/hero-bg.webp';
import brandLogo from './assets/images/logo.webp';
import productPhotoOne from './assets/images/image.webp';
import productPhotoTwo from './assets/images/image copy.webp';
import productPhotoThree from './assets/images/image copy 2.webp';

const suppliedImages = [productPhotoOne, productPhotoTwo, productPhotoThree];

// Inject template into app
document.getElementById('app').innerHTML = templateHtml;

let data = { settings: {}, categories: [], products: [] };
const picked = {};

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}
function fmt(n) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(Number(n) || 0);
}
function toast(t) {
  const el = document.getElementById('toast');
  el.textContent = t;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1600);
}

/* גישה בטוחה לשדות. שדה שאינו קיים בדף החזיר בעבר שגיאה ששברה
   מסך שלם — למשל חלון "מוצר חדש" שלא נפתח כלל. */

/* גלילה בטוחה. בדפדפנים או בסביבות שבהן הפונקציה חסרה,
   הקריאה הישירה זרקה שגיאה ששברה את הניווט כולו. */
function scrollToEl(id, opts) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView(opts || { behavior: 'smooth' });
  else if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}

function fval(id, fallback = '') { const el = document.getElementById(id); return el ? el.value : fallback; }
function fset(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* ===== Data Loading ===== */
async function loadData() {
  const [settingsRes, catsRes, prodsRes, dealsRes] = await Promise.all([
    supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('products').select('*, product_flavors(*)').order('sort_order'),
    supabase.from('deals').select('*').order('sort_order'),
  ]);

  data.settings = settingsRes.data || {};
  data.categories = (catsRes.data || []).map(c => c.name);
  data.products = (prodsRes.data || []).map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price,
    oldPrice: p.old_price,
    category: p.category,
    brand: p.brand,
    stock: p.stock,
    badge: p.badge,
    desc: p.description,
    image: p.image_url,
    flavors: (p.product_flavors || []).sort((a, b) => a.sort_order - b.sort_order).map(f => ({ id: f.id, n: f.name, out: f.out })),
  }));
  data.deals = (dealsRes.data || []).map(d => ({
    id: d.id, name: d.name, sku: d.sku,
    oldPrice: d.old_price, price: d.price,
    desc: d.description, badge: d.badge, image: d.image_url,
    category: d.category || '', brand: d.brand || '', stock: d.stock || 0,
    collection: d.collection || 'deals',
    combo: d.combo === true,
    flavors: Array.isArray(d.flavors) ? d.flavors : [],
    sort_order: d.sort_order,
  }));
}

/* ===== WhatsApp ===== */
function waNumber() { return String(data.settings.whatsapp || '').replace(/\D/g, ''); }
function waLink(text) { const n = waNumber(); return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : '#'; }
function waGeneral() { return waLink('שלום, הגעתי מהקטלוג הסיטונאי של ' + (data.settings.business_name || '') + ' ואשמח לפרטים ומחירון.'); }
function waProduct(id) {
  const p = data.products.find(x => x.id === id);
  if (!p) return;
  const sel = picked[id] || '';
  let t = 'שלום, אני מעוניין להזמין.\n\nקטלוג: ' + collectionLabel(itemCollection(id)) + '\nמוצר: ' + p.name + '\nמק״ט: ' + (p.sku || '—');
  if (sel) t += '\nטעם: ' + sel;
  t += '\nכמות: ';
  window.open(waLink(t), '_blank');
}

/* ===== Flavor Picking ===== */
/* טעם אחד לכל בחירה. מוצר עם שני טעמים באותה שורה אינו מצב חוקי
   בהזמנה, ולכן הבחירה מחליפה ולא מצטברת. מי שרוצה טעם נוסף
   מוסיף אותו כשורה נפרדת בעגלה. */
function itemById(id) {
  return data.products.find(x => String(x.id) === String(id))
      || dealsList().find(x => String(x.id) === String(id));
}
function pickFlavor(id, name) {
  const p = itemById(id);
  if (!p) return;
  const f = (p.flavors || []).find(x => x.n === name);
  if (!f || f.out) return;
  picked[id] = (picked[id] === name) ? null : name;
  renderProducts();
  renderDeals();
}
/* מחלץ את כמות השאיפות משם הדגם, לתצוגה על האריח הממותג */
function puffLabel(name) {
  const m = String(name).replace(/,/g, '').match(/(\d{3,7})\s*(?:שאיפות|puffs?)/i);
  if (!m) return '';
  const n = Number(m[1]);
  return n >= 1000 ? Math.round(n / 1000) + 'K' : String(n);
}
/* שם המותג בלטינית מתוך שם המוצר המלא, לכותרת האריח */
function tileTitle(p) {
  const after = String(p.name).split('|')[1];
  return (after || p.brand || p.name).trim();
}
/* אריח חלופי בסגנון הניאון של האתר, כשאין עדיין צילום מוצר.
   מצויר במלואו בעיצוב, ולכן לא מוסיף שום משקל לקובץ. */
function productTile(p) {
  const puffs = puffLabel(p.name);
  const hue = (Math.abs([...String(p.sku || p.name)].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360);
  return `<div class="tile" style="--tileHue:${hue}deg">
    <span class="tileGlow"></span>
    <span class="tileMark"></span>
    <span class="tileName">${esc(tileTitle(p))}</span>
    ${puffs ? `<span class="tilePuffs">${puffs}</span>` : ''}
  </div>`;
}

function flavorChips(p) {
  const list = p.flavors || [];
  if (!list.length) return '';
  const sel = picked[p.id] || null;
  const chips = list.map(f => {
    const cls = 'flav' + (f.out ? ' out' : '') + (sel === f.n ? ' on' : '');
    const safe = esc(f.n).replace(/'/g, "\\'");
    const click = f.out ? '' : ` onclick="pickFlavor('${p.id}','${safe}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pickFlavor('${p.id}','${safe}')}" tabindex="0" role="radio" aria-checked="${sel === f.n}"`;
    const ttl = f.out ? ' title="אזל מהמלאי"' : '';
    return `<span class="${cls}"${click}${ttl}>${esc(f.n)}${f.out ? ' ✕' : ''}</span>`;
  }).join('');
  const avail = list.filter(f => !f.out).length;
  return `<div class="flavHead">בחירת טעם <small>${sel ? 'נבחר: ' + esc(sel) : 'טעם אחד לכל הוספה · ' + avail + ' מתוך ' + list.length + ' במלאי'}</small></div><div class="flavs">${chips}</div>`;
}

/* ===== Rendering ===== */
function catalogVisible() { return data.settings.catalog_visible !== false; }

/* הודעה ברורה כשהשמירה לשרת נכשלה, במקום כישלון שקט */
window.onSaveError = function (r) {
  const msg = r.status === 401 ? 'השמירה נדחתה: סיסמת הניהול שגויה או פגה'
            : (r.error || 'השמירה לשרת נכשלה');
  toast(msg);
  const b = document.getElementById('saveState');
  if (b) { b.textContent = msg; b.classList.remove('hidden'); }
};

function applySettings() {
  const st2 = document.getElementById('serverState');
  if (st2) {
    st2.textContent = isServerMode() ? 'מחובר לשרת · השינויים נשמרים לכל המכשירים'
                                     : 'מצב מקומי · השינויים נשמרים בדפדפן הזה בלבד';
    st2.className = 'serverState ' + (isServerMode() ? 'on' : 'off');
  }
  document.body.classList.toggle('hideCatalog', !catalogVisible());
  const s = data.settings;
  const heroDevice = document.getElementById('heroDevice');
  if (heroDevice && !heroDevice.src) heroDevice.src = heroBackdrop;
  if (s.primary_color) document.documentElement.style.setProperty('--primary', s.primary_color);
  if (s.secondary_color) document.documentElement.style.setProperty('--secondary', s.secondary_color);
  if (s.accent_color) document.documentElement.style.setProperty('--accent', s.accent_color);

  setText('brandNameTop', s.business_name);
  setText('brandSubTop', s.business_sub);
  setText('heroEyebrow', s.hero_eyebrow);
  setText('heroTitle', s.hero_title || '');
  setText('heroText', s.hero_text);
  setText('aboutTitle', s.about_title);
  setText('aboutText', s.about_text);
  setText('footerBrand', s.business_name);
  setText('footerText', s.footer_text);

  setText('legalBiz', s.business_name);
  setText('areaNote', s.area_note || '');
  /* חותמת גרסה, כדי לדעת מיד אם רואים את הבנייה האחרונה */
  setText('buildStamp', 'גרסה ' + BUILD_ID + ' · ' + BUILD_DATE);

  const lm = document.getElementById('logoMark');
  lm.innerHTML = `<img src="${esc(s.logo || brandLogo)}" alt="${esc(s.business_name || '')}">`;

  document.querySelectorAll('.waLink').forEach(a => {
    a.href = waGeneral();
    a.classList.toggle('hidden', !waNumber());
  });
  setText('footerPhone', s.phone);
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || ''; }
function setHTML(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val || ''; }

function renderCategories() {
  const box = document.getElementById('categoryCards');
  const icons = ['◈', '✦', '⬡', '✺'];
  box.innerHTML = data.categories.map((c, i) =>
    `<div class="cat" onclick="filterCategory('${esc(c).replace(/'/g, "\\'")}')">
      <div class="icon">${icons[i % 4]}</div>
      <h3>${esc(c)}</h3>
      <p>${catalogItems().filter(p => p.category === c).length} מוצרים</p>
    </div>`
  ).join('');

  const cf = document.getElementById('catFilter');
  const pc = document.getElementById('pCategory');
  [cf, pc].forEach((el, idx) => {
    const current = el.value;
    el.innerHTML = (idx === 0 ? '<option value="">כל הקטגוריות</option>' : '') + data.categories.map(c => `<option>${esc(c)}</option>`).join('');
    if ([...el.options].some(o => o.value === current)) el.value = current;
  });

  setText('statCategories', data.categories.length);
  setText('dashCats', data.categories.length);
}

function filterCategory(c) {
  document.getElementById('catFilter').value = c;
  renderProducts();
  scrollToCatalog();
}

/* מקטע הקטלוג בדף הבית מציג את מוצרי המחירון — אלה עם המחירים
   והטעמים. הרשימה הישנה נשארת שמורה בנתונים ואינה מוצגת. */
function catalogItems() { return itemsOf('deals'); }

function renderProducts() {
  const q = fval('search').trim().toLowerCase();
  const cat = fval('catFilter');
  const brand = fval('brandFilter');
  const sort = fval('sort');

  let arr = catalogItems().filter(p =>
    (!q || [p.name, p.sku, p.brand, p.desc, (p.flavors || []).map(f => f.n).join(' ')].join(' ').toLowerCase().includes(q)) &&
    (!cat || p.category === cat) &&
    (!brand || p.brand === brand));

  if (sort === 'priceAsc') arr = arr.slice().sort((a, b) => a.price - b.price);
  if (sort === 'priceDesc') arr = arr.slice().sort((a, b) => b.price - a.price);
  if (sort === 'name') arr = arr.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));

  const count = document.getElementById('resultsCount');
  if (count) count.textContent = `${arr.length} מוצרים`;

  const grid = document.getElementById('productsGrid');
  if (grid) {
    grid.innerHTML = arr.length ? arr.map(itemCardHTML).join('')
      : `<div class="empty" style="grid-column:1/-1">לא נמצאו מוצרים</div>`;
  }

  setText('statProducts', catalogItems().length);
  setText('dashProducts', data.products.length);
  setText('dashStock', data.products.reduce((s, p) => s + (Number(p.stock) || 0), 0));
  setText('dashFlavorsOut', catalogItems().reduce((s, p) => s + (p.flavors || []).filter(f => f.out).length, 0));
}

function renderBrands() {
  const el = document.getElementById('brandFilter');
  const cur = el.value;
  const brands = [...new Set(catalogItems().map(p => p.brand).filter(Boolean))].sort();
  /* מסנן בלי ערכים הוא רעש. מוסתר עד שיוגדרו מותגים או סוגים. */
  el.classList.toggle('hidden', brands.length === 0);
  const cf = document.getElementById('catFilter');
  if (cf) cf.classList.toggle('hidden', [...new Set(catalogItems().map(p => p.category).filter(Boolean))].length === 0);
  el.innerHTML = '<option value="">כל המותגים</option>' + brands.map(b => `<option>${esc(b)}</option>`).join('');
  if (brands.includes(cur)) el.value = cur;
}

function renderAdminProducts() {
  document.getElementById('adminProducts').innerHTML = data.products.map(p => {
    const fl = p.flavors || [];
    const out = fl.filter(f => f.out).length;
    return `<tr>
      <td>${p.image ? `<img class="miniImg" src="${esc(p.image)}">` : `<div class="miniImg" style="display:grid;place-items:center">◈</div>`}</td>
      <td><b>${esc(p.name)}</b><div style="color:var(--muted);font-size:11px">${esc(p.sku)}</div></td>
      <td>${fmt(p.price)}</td>
      <td>${esc(p.category)}</td>
      <td>${p.stock}</td>
      <td>${fl.length ? `${fl.length - out}/${fl.length}${out ? ` <span style="color:var(--danger)">(${out} אזלו)</span>` : ''}` : '—'}</td>
      <td>
        <button class="iconBtn" onclick="editProduct('${p.id}')">✏️</button>
        <button class="iconBtn" onclick="duplicateProduct('${p.id}')">⧉</button>
        <button class="iconBtn" onclick="deleteProduct('${p.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function renderAdminCats() {
  document.getElementById('adminCats').innerHTML = data.categories.map(c =>
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span>${esc(c)} <small style="color:var(--muted)">(${catalogItems().filter(p => p.category === c).length})</small></span>
      <button class="iconBtn" onclick="deleteCategory('${esc(c).replace(/'/g, "\\'")}')">מחק</button>
    </div>`
  ).join('');
}

function renderAll() {
  applySettings();
  renderCategories();
  renderBrands();
  renderProducts();
  renderAdminProducts();
  renderAdminCats();
  renderDeals();
  renderContact();
  renderCart();
  fillAdminForms();
}

function scrollToCatalog() { scrollToEl('catalog'); }

let adminUnlocked = false;

/* ===== כניסת מנהל =====
   הפאנל אינו נגיש מהאתר. הוא נפתח רק בכתובת שמסתיימת ב-#admin,
   או בצירוף המקשים Ctrl+Shift+A, ואז נדרשת סיסמה.

   הסיסמה עצמה לא נשמרת בשום מקום. נשמר רק טביעת אצבע שלה,
   ורק בדפדפן שבו הגדרת אותה. חשוב לדעת: באתר סטטי כל הקוד רץ
   אצל המבקר, ולכן זהו מנעול נוחות ולא הגנה. ההגנה האמיתית היא
   שרק בעל חשבון הגיטהאב יכול לפרסם שינויים. */
const ADMIN_KEY = 'hameashenet_admin_hash';

async function hashPass(text) {
  if (window.crypto && crypto.subtle && window.isSecureContext) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hm:' + text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // מסלול גיבוי לדפדפנים ישנים או לפתיחה מקובץ מקומי
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return 'f' + (h >>> 0).toString(16);
}

function adminPrompt(title, note, label) {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'adminGate';
    box.innerHTML = `<div class="adminGateBox">
      <h2>${esc(title)}</h2>
      <p>${esc(note)}</p>
      <input type="password" id="agPass" class="input" placeholder="${esc(label)}" autocomplete="off">
      <div id="agErr" class="agErr"></div>
      <div class="agBtns">
        <button class="btn primary" id="agOk">אישור</button>
        <button class="btn ghost" id="agCancel">ביטול</button>
      </div>
    </div>`;
    document.body.appendChild(box);
    const input = box.querySelector('#agPass');
    input.focus();
    const done = v => { box.remove(); resolve(v); };
    box.querySelector('#agOk').onclick = () => done(input.value);
    box.querySelector('#agCancel').onclick = () => done(null);
    input.onkeydown = e => { if (e.key === 'Enter') done(input.value); if (e.key === 'Escape') done(null); };
  });
}

async function requestAdmin() {
  if (adminUnlocked || sessionStorage.getItem('adminOk') === '1') return openAdmin();

  if (isServerMode()) {
    const pass0 = await adminPrompt('כניסת מנהל', 'הזן את סיסמת הניהול שהוגדרה בשרת.', 'סיסמה');
    if (pass0 === null) return;
    const ok = await verifyAdmin(pass0);
    if (ok) { sessionStorage.setItem('adminOk', '1'); return openAdmin(); }
    alert('סיסמה שגויה');
    return;
  }

  const stored = localStorage.getItem(ADMIN_KEY);
  if (!stored) {
    const pass = await adminPrompt(
      'הגדרת סיסמת ניהול',
      'זו הכניסה הראשונה בדפדפן הזה. בחר סיסמה שתשמור על הפאנל סגור בפני מי שאינו אתה.',
      'סיסמה חדשה');
    if (!pass || pass.length < 4) { if (pass !== null) alert('הסיסמה קצרה מדי'); return; }
    localStorage.setItem(ADMIN_KEY, await hashPass(pass));
    sessionStorage.setItem('adminOk', '1');
    return openAdmin();
  }

  const pass = await adminPrompt('כניסת מנהל', 'הזן את סיסמת הניהול כדי לפתוח את הפאנל.', 'סיסמה');
  if (pass === null) return;
  if (isServerMode()) {
    /* על שרת הסיסמה נבדקת בצד השרת, ולכן לא ניתן לעקוף אותה מהדפדפן */
    const ok = await verifyAdmin(pass);
    if (ok) { sessionStorage.setItem('adminOk', '1'); return openAdmin(); }
    alert('סיסמה שגויה');
    return;
  }
  if (await hashPass(pass) === stored) {
    sessionStorage.setItem('adminOk', '1');
    return openAdmin();
  }
  alert('סיסמה שגויה');
}

async function changeAdminPass() {
  const pass = await adminPrompt('החלפת סיסמה', 'הסיסמה החדשה תישמר בדפדפן הזה בלבד.', 'סיסמה חדשה');
  if (!pass) return;
  if (pass.length < 4) return alert('הסיסמה קצרה מדי');
  localStorage.setItem(ADMIN_KEY, await hashPass(pass));
  toast('הסיסמה עודכנה');
}

function openAdmin() {
  adminUnlocked = true;
  document.getElementById('adminOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  applyA11y();
}
function adminLogout() {
  sessionStorage.removeItem('adminOk');
  adminUnlocked = false;
  closeAdmin();
  toast('התנתקת מהניהול');
}
function publishData() { exportDataFile(); toast('הקובץ הורד. העלה אותו למאגר כדי לפרסם'); }
async function loadDataFile(e) {
  const f = e.target.files[0]; if (!f) return;
  try { await importDataFile(f); await loadData(); renderAll(); toast('הנתונים נטענו'); }
  catch (err) { alert('הקובץ אינו תקין'); }
}






/* ===== תפריט שלושת הפסים =====
   נבנה מהנתונים ולא מרשימה קבועה, כך שכשמשנים שם לשונית בפאנל
   או כשאוסף מתרוקן — התפריט מתעדכן לבד. */
function menuItems() {
  const s = data.settings;
  return [
    { label: 'דף הבית', act: 'goHome()' },
    { label: s.deals_title || 'קטלוג', act: 'goCatalog()', hide: !catalogVisible() },
    { label: 'מבצע 2 ב־100', act: 'openCombo()', count: comboItems().length },
    { label: s.business_title || 'קטלוג לעסקים', act: 'openBiz()', count: itemsOf('business').length },
    { label: s.accessories_title || 'אביזרי סלולר', act: 'openAcc()', count: itemsOf('accessories').length },
    { label: s.toys_title || 'צעצועים', act: 'openToys()', count: itemsOf('toys').length },
    { label: 'קטגוריות', act: 'goCategories()' },
    { label: 'אודות', act: 'goAbout()' },
    { label: s.contact_title || 'פנייה למערכת', act: 'openContact()' },
    { label: 'תקנון ותנאי שימוש', act: 'openTerms()' },
    { label: 'הצהרת נגישות', act: 'openAccessibility()' },
  ].filter(x => !x.hide);
}
function renderMenu() {
  const box = document.getElementById('menuLinks');
  if (!box) return;
  box.innerHTML = menuItems().map(i =>
    `<button onclick="${i.act};closeMenu()">${esc(i.label)}${
      i.count === 0 ? '<span class="menuEmpty">ריק</span>' : ''}</button>`).join('');
}
function openMenu() { document.getElementById('menuPanel').classList.add('open'); document.body.classList.add('menuOpen'); document.body.style.overflow = 'hidden'; renderMenu(); }
function closeMenu() { const m = document.getElementById('menuPanel'); if (m) m.classList.remove('open'); document.body.classList.remove('menuOpen'); document.body.style.overflow = ''; }
function toggleMenu() {
  const m = document.getElementById('menuPanel');
  m.classList.contains('open') ? closeMenu() : openMenu();
}
function backToMain() { document.body.classList.remove('showTerms', 'showDeals', 'showContact', 'showAcc'); if (location.hash) history.pushState(null, '', location.pathname + location.search); }
function goHome() { backToMain(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function goCatalog() { backToMain(); setTimeout(() => scrollToEl('catalog'), 40); }
function goCategories() { backToMain(); setTimeout(() => scrollToEl('categories'), 40); }
function goAbout() { backToMain(); setTimeout(() => scrollToEl('about'), 40); }


/* ===== נגישות =====
   תפריט הגדרות נגישות, שמירת ההעדפות בדפדפן, והתאמות מקלדת.
   נדרש בישראל לפי תקנות שוויון זכויות לאנשים עם מוגבלות,
   בהתאם לתקן 5568 המבוסס על ההנחיות הבינלאומיות. */
const A11Y_KEY = 'hameashenet_a11y';
let a11y = loadA11y();

function loadA11y() {
  try { return Object.assign({ font: 0, contrast: false, links: false, motion: false, readable: false }, JSON.parse(localStorage.getItem(A11Y_KEY)) || {}); }
  catch (e) { return { font: 0, contrast: false, links: false, motion: false, readable: false }; }
}
function applyA11y() {
  const r = document.documentElement;
  r.style.setProperty('--a11yScale', String(1 + a11y.font * 0.1));
  document.body.classList.toggle('a11yContrast', !!a11y.contrast);
  document.body.classList.toggle('a11yLinks', !!a11y.links);
  document.body.classList.toggle('a11yMotion', !!a11y.motion);
  document.body.classList.toggle('a11yReadable', !!a11y.readable);
  document.querySelectorAll('[data-a11y]').forEach(b => {
    const k = b.dataset.a11y;
    if (k !== 'font+' && k !== 'font-' && k !== 'reset') b.setAttribute('aria-pressed', String(!!a11y[k]));
  });
  const lbl = document.getElementById('a11yFontLabel');
  if (lbl) lbl.textContent = Math.round((1 + a11y.font * 0.1) * 100) + '%';
  try { localStorage.setItem(A11Y_KEY, JSON.stringify(a11y)); } catch (e) {}
}
function setA11y(k) {
  if (k === 'font+') a11y.font = Math.min(4, a11y.font + 1);
  else if (k === 'font-') a11y.font = Math.max(-1, a11y.font - 1);
  else if (k === 'reset') a11y = { font: 0, contrast: false, links: false, motion: false, readable: false };
  else a11y[k] = !a11y[k];
  applyA11y();
}
function toggleA11yMenu() {
  const p = document.getElementById('a11yPanel');
  const open = p.classList.toggle('open');
  document.getElementById('a11yBtn').setAttribute('aria-expanded', String(open));
  if (open) p.querySelector('button').focus();
}
function closeA11yMenu() {
  const p = document.getElementById('a11yPanel');
  if (p) p.classList.remove('open');
  const b = document.getElementById('a11yBtn');
  if (b) b.setAttribute('aria-expanded', 'false');
}

/* סגירה במקש ESC בכל החלונות, דרישת נגישות בסיסית */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeA11yMenu(); closeMenu(); closeCart();
});

/* ===== עגלה =====
   נשמרת בדפדפן של הלקוח בלבד. בסיום ההזמנה מורכבת הודעת וואטסאפ
   מסודרת עם כל הפריטים, מועד האספקה ואמצעי התשלום המבוקש.
   התשלום עצמו אינו מתבצע באתר. ראו הערה בעמוד העגלה. */
const BUILD_ID = 'B09232042';
const BUILD_DATE = '23.09.2026 20:42';
const CART_KEY = 'hameashenet_cart_v1';
let cart = loadCart();

function loadCart() {
  try {
    const x = JSON.parse(localStorage.getItem(CART_KEY));
    if (!Array.isArray(x)) return [];
    /* המרה מהמבנה הישן, שבו שורה יכלה להחזיק כמה טעמים */
    return x.flatMap(l => {
      if (!Array.isArray(l.flavors)) return [{ ...l, flavor: l.flavor || '' }];
      if (l.flavors.length <= 1) return [{ ...l, flavor: l.flavors[0] || '' }];
      return l.flavors.map(f => ({ ...l, flavor: f, key: l.kind + ':' + l.id + ':' + f }));
    });
  } catch (e) { return []; }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  renderCart();
}
/* שם הקטלוג שממנו הגיע הפריט, לשמירה בשורת העגלה */
function collectionLabel(col) {
  const st = data.settings;
  if (col === 'business') return st.business_title || 'קטלוג לעסקים';
  if (col === 'accessories') return st.accessories_title || 'אביזרי סלולר';
  if (col === 'legacy') return 'קטלוג ישן';
  return st.deals_title || 'קטלוג מוצרים';
}
function itemCollection(id) {
  const it = dealsList().find(x => String(x.id) === String(id));
  return it ? (it.collection || 'deals') : 'legacy';
}

function findItem(kind, id) {
  return kind === 'deal'
    ? dealsList().find(x => String(x.id) === String(id))
    : data.products.find(x => String(x.id) === String(id));
}
function addToCart(kind, id) {
  const src = findItem(kind, id);
  if (!src) return;

  /* מוצר עם טעמים מחייב בחירת טעם אחד. בלי זה נוצרת בעגלה שורה
     שאי אפשר לספק. הבחירה היא של טעם יחיד, ולכן שורה בעגלה לעולם
     לא תכיל שני טעמים לאותו מוצר. */
  const inStock = (src.flavors || []).filter(f => !f.out);
  const sel = picked[id] || '';
  if (inStock.length && !sel) {
    flashFlavorPrompt(id);
    return;
  }

  const key = kind + ':' + id + ':' + sel;
  const line = cart.find(l => l.key === key);
  if (line) line.qty += 1;
  else {
    const col = itemCollection(id);
    cart.push({ key, kind, id, name: src.name, sku: src.sku || '',
      price: Number(src.price) || 0, flavor: sel, qty: 1,
      collection: col, source: collectionLabel(col) });
  }
  picked[id] = null;                 // איפוס, כדי שהבחירה הבאה תהיה מודעת
  renderProducts(); renderDeals();
  saveCart();
  openCart();
  toast(sel ? 'נוסף לעגלה · ' + sel : 'נוסף לעגלה');
}

/* מסמן ויזואלית שצריך לבחור טעם, במקום להוסיף שורה פגומה בשקט */
function flashFlavorPrompt(id) {
  toast('יש לבחור טעם אחד לפני ההוספה');
  document.querySelectorAll('.flavs').forEach(box => {
    const card = box.closest('.product, .deal');
    if (!card) return;
    const btn = card.querySelector('.cardBtns .btn.primary');
    if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'" + id + "'")) {
      box.classList.add('needPick');
      if (typeof box.scrollIntoView === 'function') box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => box.classList.remove('needPick'), 1600);
    }
  });
}
function setQty(key, n) {
  const line = cart.find(l => l.key === key);
  if (!line) return;
  line.qty = Math.max(0, n);
  if (!line.qty) cart = cart.filter(l => l.key !== key);
  saveCart();
}
function removeLine(key) { cart = cart.filter(l => l.key !== key); saveCart(); }
function clearCart() { if (!confirm('לרוקן את העגלה?')) return; cart = []; saveCart(); }
/* ===== מבצע 2 ב־100 =====
   חל על סיגריות אלקטרוניות בלבד — הקטלוג הרגיל והקטלוג לעסקים.
   אביזרי סלולר אינם משתתפים. תנאי הסף: מחיר יחידה עד 50 כולל. */
const COMBO_PRICE = 100;
/* ההשתתפות במבצע נקבעת ידנית לכל פריט בפאנל הניהול.
   זה עדיף על סף מחיר: סף מחיר לא מבדיל בין מוצר שהמבצע
   מוזיל אותו לבין מוצר שהוא דווקא מייקר. */
function comboEligible(it) {
  if (!it) return false;
  if (it.combo === true) return true;
  const src = dealsList().find(x => String(x.id) === String(it.id));
  return !!(src && src.combo === true);
}
function comboItems() { return dealsList().filter(x => x.combo === true); }

/* היחידות היקרות מזווגות תחילה, כך שההנחה תמיד לטובת הלקוח */
function comboBreakdown() {
  const units = [];
  cart.forEach(l => { if (comboEligible(l)) for (let i = 0; i < l.qty; i++) units.push(l.price); });
  units.sort((a, b) => b - a);

  let pairs = 0, comboPrice = 0, listPrice = 0;
  for (let i = 0; i + 1 < units.length; i += 2) {
    const sum = units[i] + units[i + 1];
    /* המבצע מוחל רק כשהוא מוזיל. זוג שמחירו במחירון נמוך
       מ־100 נשאר במחיר המחירון, כדי שהלקוח לעולם לא ישלם
       יותר בגלל מבצע. */
    listPrice += sum;
    comboPrice += Math.min(sum, COMBO_PRICE);
    if (sum > COMBO_PRICE) pairs++;
  }
  const restStart = units.length - (units.length % 2);
  const rest = units.slice(restStart);
  return {
    pairs, restCount: rest.length,
    restPrice: rest.reduce((a, p) => a + p, 0),
    listPrice, comboPrice,
    saving: Math.max(0, listPrice - comboPrice),
    eligibleUnits: units.length,
    pairsTotal: Math.floor(units.length / 2),
  };
}

function cartCount() { return cart.reduce((s, l) => s + l.qty, 0); }
function cartSubtotal() { return cart.reduce((a, l) => a + l.price * l.qty, 0); }
function cartTotal() {
  const c = comboBreakdown();
  const other = cart.reduce((a, l) => a + (comboEligible(l) ? 0 : l.price * l.qty), 0);
  return other + c.comboPrice + c.restPrice;
}

function renderCart() {
  const n = cartCount();
  document.querySelectorAll('.cartCount').forEach(b => {
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
  });
  const box = document.getElementById('cartLines');
  if (!box) return;
  box.innerHTML = cart.length ? cart.map(l => `<div class="cartLine">
      <div class="cartInfo">
        <b>${esc(String(l.name).split('|')[0].trim())}</b>
        ${l.flavor ? `<span class="cartFlav">טעם: ${esc(l.flavor)}</span>` : ''}
        ${l.sku ? `<span class="cartSku">מק״ט ${esc(l.sku)}</span>` : ''}
        <span class="cartSrc">${esc(l.source || collectionLabel(l.collection))}</span>
      </div>
      <div class="qty">
        <button onclick="setQty('${esc(l.key)}',${l.qty - 1})" aria-label="הפחת">−</button>
        <span>${l.qty}</span>
        <button onclick="setQty('${esc(l.key)}',${l.qty + 1})" aria-label="הוסף">+</button>
      </div>
      <div class="cartSum">${l.price ? fmt(l.price * l.qty) : 'לתיאום'}</div>
      <button class="iconBtn" onclick="removeLine('${esc(l.key)}')">🗑️</button>
    </div>`).join('') : '<div class="cartEmpty">העגלה ריקה</div>';

  const c = comboBreakdown();
  const cb = document.getElementById('comboBox');
  if (cb) {
    if (c.saving > 0) {
      cb.classList.remove('hidden');
      cb.innerHTML = `<b>מבצע 2 ב־${COMBO_PRICE}</b>
        <p>${c.pairs} ${c.pairs === 1 ? 'זוג' : 'זוגות'} במחיר מבצע${c.restCount ? ' · יחידה נוספת במחיר מלא' : ''}</p>
        <div class="comboSave">חיסכון ${fmt(c.saving)}</div>`;
    } else if (c.eligibleUnits) {
      cb.classList.remove('hidden');
      cb.innerHTML = `<b>מבצע 2 ב־${COMBO_PRICE}</b><p>${
        c.eligibleUnits % 2 ? 'הוספת מוצר נוסף מהמבצע משלימה זוג.' : 'המחיר הרגיל נמוך ממחיר המבצע, ולכן חויב הזול מביניהם.'}</p>`;
    } else cb.classList.add('hidden');
  }
  const sub = document.getElementById('cartSubRow');
  if (sub) {
    sub.classList.toggle('hidden', c.saving <= 0);
    setText('cartSubtotal', fmt(cartSubtotal()));
  }
  const t = document.getElementById('cartTotal');
  if (t) t.textContent = cartTotal() ? fmt(cartTotal()) : '—';
  const foot = document.getElementById('cartFoot');
  if (foot) foot.classList.toggle('hidden', cart.length === 0);
}

function openCart() { document.getElementById('cartPanel').classList.add('open'); document.body.style.overflow = 'hidden'; renderCart(); }
function closeCart() { document.getElementById('cartPanel').classList.remove('open'); document.body.style.overflow = ''; }

function pickWhen(v) {
  document.querySelectorAll('.whenBtn').forEach(b => b.classList.toggle('on', b.dataset.when === v));
  document.getElementById('whenFields').classList.toggle('hidden', v !== 'later');
}
function pickPay(v) {
  document.querySelectorAll('.payBtn').forEach(b => b.classList.toggle('on', b.dataset.pay === v));
}

function submitOrder() {
  if (!cart.length) return;
  const when = (document.querySelector('.whenBtn.on') || {}).dataset?.when || 'now';
  const pay = (document.querySelector('.payBtn.on') || {}).dataset?.pay || 'לא צוין';
  const date = fval('orderDate');
  const time = fval('orderTime');
  const note = fval('orderNote').trim();

  /* הפריטים מקובצים לפי הקטלוג שממנו הוזמנו, עם כותרת לכל קבוצה,
     כדי שיהיה ברור מיד מאיפה כל פריט הגיע. */
  const groups = {};
  cart.forEach(l => {
    const k = l.source || collectionLabel(l.collection);
    (groups[k] = groups[k] || []).push(l);
  });
  const names = Object.keys(groups);

  let t = 'הזמנה חדשה מהאתר\n';
  t += '──────────────\n';
  if (names.length > 1) t += 'ההזמנה כוללת פריטים מ־' + names.length + ' קטלוגים\n';

  let n = 0;
  names.forEach(g => {
    t += '\n◆ ' + g + '\n';
    groups[g].forEach(l => {
      n++;
      t += n + '. ' + l.name;
      if (l.sku) t += ' (' + l.sku + ')';
      t += '\n   כמות: ' + l.qty;
      if (l.flavor) t += ' | טעם: ' + l.flavor;
      if (l.price) t += ' | ' + fmt(l.price * l.qty);
      t += '\n';
    });
  });

  const c = comboBreakdown();
  t += '\n──────────────\n';
  if (c.saving > 0) {
    t += 'מחיר מחירון: ' + fmt(cartSubtotal()) + '\n';
    t += 'מבצע 2 ב־' + COMBO_PRICE + ': ' + c.pairs + (c.pairs === 1 ? ' זוג' : ' זוגות');
    if (c.restCount) t += ' + ' + c.restCount + ' יחידה במחיר מלא';
    t += '\nחיסכון: ' + fmt(c.saving) + '\n';
  }
  if (cartTotal()) t += 'סה״כ לתשלום: ' + fmt(cartTotal()) + ' (לפני מע״מ)\n';

  t += '\nמועד אספקה: ' + (when === 'now' ? 'מיידי, בהקדם האפשרי'
        : 'מועד עתידי' + (date ? ' — ' + date : '') + (time ? ' בשעה ' + time : ''));
  t += '\nאמצעי תשלום מבוקש: ' + pay;
  if (note) t += '\n\nהערות: ' + note;
  window.open(waLink(t), '_blank');
}


/* ===== עמוד הצעצועים =====
   עמוד עצמאי שאינו נגיש בגלילת דף הבית, עם עיצוב משלו.
   הפריטים יושבים באותו מנוע, תחת האוסף toys. */
let toyCat = '';
function toysItems() { return itemsOf('toys'); }
function toyCategories() {
  const map = {};
  toysItems().forEach(i => {
    const c = (i.category || 'כללי').trim();
    (map[c] = map[c] || []).push(i);
  });
  return map;
}
function setToyCat(c) {
  toyCat = c;
  const btn = document.getElementById('toysClear');
  if (btn) btn.hidden = !c;
  renderToys();
  scrollToEl('toysListTitle', { behavior: 'smooth', block: 'start' });
}
function renderToys() {
  const st = data.settings;
  setText('toysTitle', st.toys_title || 'צעצועים');
  setText('toysSubtitle', st.toys_subtitle || '');
  const nav = document.getElementById('navToys');
  if (nav) nav.textContent = st.toys_title || 'צעצועים';

  const cats = toyCategories();
  const names = Object.keys(cats).sort((a, b) => a.localeCompare(b, 'he'));
  const cg = document.getElementById('toysCatGrid');
  if (cg) {
    cg.innerHTML = names.length ? names.map((n, i) => {
      const first = cats[n].find(x => x.image);
      return `<button class="toysCat${toyCat === n ? ' on' : ''}" style="--tHue:${(i * 47) % 360}deg" onclick="setToyCat('${esc(n).replace(/'/g, "\\'")}')">
        <span class="toysCatPic">${first ? `<img src="${esc(first.image)}" alt="">` : '<span class="toysCatDot"></span>'}</span>
        <span class="toysCatName">${esc(n)}</span>
        <span class="toysCatNum">${cats[n].length}</span>
      </button>`;
    }).join('') : '<div class="toysEmpty">עדיין לא הוגדרו קטגוריות</div>';
  }

  const q = fval('toysSearch').trim().toLowerCase();
  let arr = toysItems();
  if (toyCat) arr = arr.filter(i => (i.category || 'כללי').trim() === toyCat);
  if (q) arr = arr.filter(i => [i.name, i.desc, i.sku, i.category].join(' ').toLowerCase().includes(q));
  setText('toysListTitle', toyCat ? toyCat : 'כל המוצרים');

  const g = document.getElementById('toysGrid');
  if (!g) return;
  g.innerHTML = arr.length ? arr.map(i => {
    const pct = discountPct(i);
    return `<article class="toyCard">
      <div class="toyPic">${i.image ? `<img src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : '<span class="toyNoPic"></span>'}
        ${pct ? `<span class="toyPct">${pct}%-</span>` : ''}
        ${i.badge ? `<span class="toyBadge">${esc(i.badge)}</span>` : ''}</div>
      <div class="toyBody">
        <h3>${esc(String(i.name).split('|')[0].trim())}</h3>
        ${i.desc ? `<p>${esc(i.desc)}</p>` : ''}
        <div class="toyFoot">
          <div class="toyPrice">${i.oldPrice ? `<s>${fmt(i.oldPrice)}</s>` : ''}<b>${fmt(i.price)}</b></div>
          <button class="tBtn tBtnMain toyAdd" onclick="addToCart('deal','${i.id}')">הוספה</button>
        </div>
      </div>
    </article>`;
  }).join('') : `<div class="toysEmpty">${toysItems().length ? 'לא נמצאו מוצרים מתאימים' : 'העמוד עדיין ריק. הוספת מוצרים נעשית בפאנל הניהול, באוסף הצעצועים.'}</div>`;
}

function openToys() {
  closeMenu(); closeA11yMenu();
  document.body.classList.remove('showTerms', 'showContact', 'showA11y', 'showDeals');
  document.body.classList.add('showToys');
  if (location.hash !== '#toys') history.pushState(null, '', '#toys');
  window.scrollTo(0, 0);
  renderToys();
}
function closeToys() {
  document.body.classList.remove('showToys');
  if (location.hash === '#toys') history.pushState(null, '', location.pathname + location.search);
}

/* ===== עמוד פנייה =====
   האתר סטטי ואין שרת ששולח דואר. הטופס מרכיב הודעת וואטסאפ
   מסודרת, כך שהפנייה מגיעה מלאה ולא כ"שלום, יש שאלה". */
const CONTACT_TOPICS = ['הזמנה חדשה', 'בירור מלאי', 'תמיכה או תקלה', 'החזרה או החלפה', 'שירות לקוחות', 'שיתוף פעולה', 'אחר'];
let contactTopic = CONTACT_TOPICS[0];

function renderContact() {
  const s = data.settings;
  const row = document.getElementById('topicRow');
  if (row) {
    row.innerHTML = CONTACT_TOPICS.map(t =>
      `<button type="button" class="topic${t === contactTopic ? ' on' : ''}" onclick="pickTopic('${esc(t).replace(/'/g, "\\'")}')">${esc(t)}</button>`
    ).join('');
  }
  const ph = document.getElementById('contactPhoneLink');
  if (ph) {
    const num = (s.phone || '').trim();
    ph.textContent = num;
    ph.href = num ? 'tel:' + num.replace(/[^\d+]/g, '') : '#';
    ph.classList.toggle('hidden', !num);
  }
  const area = document.getElementById('contactArea');
  if (area) {
    area.innerHTML = s.area_note ? `<b>אזור שירות</b><p>${esc(s.area_note)}</p>` : '';
    area.classList.toggle('hidden', !s.area_note);
  }
  setText('contactTitle', s.contact_title || 'פנייה למערכת');
  setText('contactText', s.contact_text || '');
}

function pickTopic(t) { contactTopic = t; renderContact(); }

function sendContact() {
  const val = id => (document.getElementById(id) || {}).value?.trim() || '';
  const msg = val('cMsg');
  const err = document.getElementById('cErr');
  if (!msg) {
    if (err) err.textContent = 'יש לכתוב את פרטי הפנייה';
    document.getElementById('cMsg').focus();
    return;
  }
  if (err) err.textContent = '';

  let t = 'פנייה מהאתר\n\nנושא: ' + contactTopic;
  const name = val('cName'), biz = val('cBiz'), phone = val('cPhone');
  if (name) t += '\nשם: ' + name;
  if (biz) t += '\nבית עסק: ' + biz;
  if (phone) t += '\nטלפון לחזרה: ' + phone;
  t += '\n\n' + msg;
  window.open(waLink(t), '_blank');
}

function openContact() {
  closeMenu();
  document.body.classList.remove('showTerms', 'showDeals', 'showAcc');
  document.body.classList.add('showContact');
  if (location.hash !== '#contact') history.pushState(null, '', '#contact');
  window.scrollTo(0, 0);
}
function closeContact() {
  document.body.classList.remove('showContact');
  if (location.hash === '#contact') history.pushState(null, '', location.pathname + location.search);
}

/* ===== עמוד המבצעים =====
   פריטים עצמאיים מהקטלוג, עם מחיר קודם ומחיר נוכחי.
   שם הלשונית והכותרת נשלטים מפאנל הניהול. */
function dealsList() { return Array.isArray(data.deals) ? data.deals : (data.deals = []); }
/* שני העמודים — מחירון ואביזרי סלולר — נשענים על אותו מנגנון פריטים.
   ההפרדה נעשית בשדה אחד, ולכן העורך, הטעמים, התמונות והמבצעים
   משותפים ואין שתי מערכות שצריך לתחזק בנפרד. */
function itemsOf(col) { return dealsList().filter(x => (x.collection || 'deals') === col); }
let adminCollection = 'deals';

function discountPct(d) {
  const o = Number(d.oldPrice) || 0, n = Number(d.price) || 0;
  if (!o || !n || n >= o) return 0;
  return Math.round((1 - n / o) * 100);
}

function itemCardHTML(d) {
  const pct = discountPct(d);
  const parts = String(d.name).split('|');
  return `<article class="deal">
    <div class="pic">${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.name)}">` : `<div class="tile" style="--tileHue:280deg"><span class="tileMark"></span><span class="tileName">${esc(d.name)}</span></div>`}
      ${pct ? `<span class="dealPct">${pct}%-</span>` : ''}
      ${d.badge ? `<span class="badge">${esc(d.badge)}</span>` : ''}</div>
    <div class="productBody">
      ${(d.sku || d.category || d.brand) ? `<div class="meta">
        ${d.category ? `<span class="pill">${esc(d.category)}</span>` : ''}
        ${d.brand ? `<span class="pill">${esc(d.brand)}</span>` : ''}
        ${d.sku ? `<span class="pill">מק״ט ${esc(d.sku)}</span>` : ''}</div>` : ''}
      <div class="pName"><h3>${esc(parts[0].trim())}</h3>${parts[1] ? `<span class="pModel">${esc(parts[1].trim())}</span>` : ''}</div>
      ${d.desc ? `<p class="desc">${esc(d.desc)}</p>` : ''}
      ${flavorChips(d)}
      <div class="priceRow">
        <div class="priceCol">
          ${d.oldPrice ? `<span class="priceWas">${fmt(d.oldPrice)}</span>` : ''}
          <span class="price">${fmt(d.price)}</span>
          <span class="priceNote">לפני מע״מ</span>
        </div>
        ${d.stock > 0 ? `<span class="stock">במלאי: ${d.stock}</span>` : ''}
      </div>
      <div class="cardBtns">
        <button class="btn primary full" onclick="addToCart('deal','${d.id}')">הוספה לעגלה${picked[d.id] ? ` · ${esc(picked[d.id])}` : ''}</button>
        <button class="btn wa full" onclick="waDeal('${d.id}')">שאלה בוואטסאפ</button>
      </div>
    </div>
  </article>`;
}

function renderCollection(col, gridId, titleId, subId, navId, titleKey, subKey) {
  const s = data.settings;
  setText(titleId, s[titleKey] || '');
  setText(subId, s[subKey] || '');
  const nav = document.getElementById(navId);
  const arr = itemsOf(col);
  if (nav) {
    nav.textContent = s[titleKey] || '';
    nav.classList.toggle('hidden', arr.length === 0);
  }
  const grid = document.getElementById(gridId);
  if (grid) {
    grid.innerHTML = arr.length ? arr.map(itemCardHTML).join('')
      : `<div class="emptyPage" style="grid-column:1/-1">
           <b>העמוד עדיין ריק</b>
           <p>כדי להוסיף פריטים: פאנל ניהול, לשונית מבצעים, בחירת האוסף המתאים ואז פריט חדש.</p>
         </div>`;
  }
}

function renderCombo() {
  const grid = document.getElementById('comboGrid');
  if (!grid) return;
  const arr = comboItems();
  const nav = document.getElementById('navCombo');
  if (nav) nav.classList.toggle('hidden', arr.length === 0);
  setText('comboCount', arr.length + ' מוצרים משתתפים');
  grid.innerHTML = arr.length ? arr.map(itemCardHTML).join('')
    : `<div class="emptyPage" style="grid-column:1/-1"><b>אין כרגע מוצרים במבצע</b><p>כדי לצרף מוצר: פאנל ניהול, קטלוג ומחירון, ואז לחיצה על העמודה "2 ב־100" בשורת המוצר.</p></div>`;
}

function renderAccessories() {
  const st = data.settings;
  setText('accTitle', st.accessories_title || 'אביזרי סלולר');
  setText('accSubtitle', st.accessories_subtitle || '');
  const nav = document.getElementById('navAcc');
  const arr = itemsOf('accessories');
  if (nav) { nav.textContent = st.accessories_title || 'אביזרי סלולר'; nav.classList.toggle('hidden', arr.length === 0); }
  const g = document.getElementById('accGrid');
  if (!g) return;
  g.innerHTML = arr.length ? arr.map(i => {
    const pct = discountPct(i);
    return `<article class="accCard">
      <div class="accPic">${i.image ? `<img src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : '<span class="accNoPic"></span>'}
        ${pct ? `<span class="accPct">${pct}%-</span>` : ''}</div>
      <div class="accBody">
        ${i.brand ? `<span class="accBrand">${esc(i.brand)}</span>` : ''}
        <h3>${esc(String(i.name).split('|')[0].trim())}</h3>
        ${i.desc ? `<p>${esc(i.desc)}</p>` : ''}
        <div class="accFoot">
          <div class="accPrice">${i.oldPrice ? `<s>${fmt(i.oldPrice)}</s>` : ''}<b>${fmt(i.price)}</b></div>
          <button class="accAdd" onclick="addToCart('deal','${i.id}')">הוספה</button>
        </div>
      </div>
    </article>`;
  }).join('') : `<div class="accEmpty">העמוד עדיין ריק. הוספת מוצרים נעשית בפאנל הניהול, באוסף אביזרי הסלולר.</div>`;
}

function renderDeals() {
  renderCollection('deals', 'dealsGrid', 'dealsTitle', 'dealsSubtitle', 'navDeals', 'deals_title', 'deals_subtitle');
  renderCombo();
  renderToys();
  renderCollection('business', 'bizGrid', 'bizTitle', 'bizSubtitle', 'navBiz', 'business_title', 'business_subtitle');
  renderAccessories();
  const s = data.settings;
  setText('catalogHead', s.deals_title || 'קטלוג מוצרים');
  setText('catalogSubtitle', s.deals_subtitle || '');
  const heroLbl = document.getElementById('heroCtaLabel');
  if (heroLbl) heroLbl.textContent = s.deals_title || 'מבצעים';
  renderMenu();
  renderAdminDeals();
}

function waDeal(id) {
  const d = dealsList().find(x => String(x.id) === String(id));
  if (!d) return;
  let t = 'שלום, ראיתי מוצר בקטלוג ואשמח לפרטים.\n\nקטלוג: ' + collectionLabel(d.collection || 'deals') + '\nפריט: ' + d.name;
  if (d.sku) t += '\nמק״ט: ' + d.sku;
  t += '\nמחיר מבצע: ' + fmt(d.price) + '\nכמות: ';
  window.open(waLink(t), '_blank');
}

/* הקטלוג לעסקים ואביזרי הסלולר הם מקטעים בדף הבית ולא עמודים
   נפרדים, ולכן הניווט אליהם הוא גלילה. */
function goSection(id) {
  backToMain();
  setTimeout(() => scrollToEl(id), 40);
}
function openBiz() { closeMenu(); goSection('business'); }
function openCombo() { closeMenu(); goSection('combo'); }
function closeBiz() { goHome(); }
function openAcc() { closeMenu(); goSection('accessories'); }
function closeAcc() { goHome(); }
/* העמוד הנפרד הוחלף בקטלוג שבדף הבית, כדי שלא יהיו שני עותקים
   של אותה רשימה. הפונקציה נשמרת כדי שקישורים ישנים ימשיכו לעבוד. */
function openDeals() {
  closeMenu();
  if (catalogVisible()) { goCatalog(); return; }
  document.body.classList.remove('showTerms', 'showContact', 'showAcc');
  document.body.classList.add('showDeals');
  if (location.hash !== '#deals') history.pushState(null, '', '#deals');
  window.scrollTo(0, 0);
}
function closeDeals() {
  document.body.classList.remove('showDeals');
  history.pushState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
}


/* עריכת טעמים בפריט מחירון, במקביל לעורך שבקטלוג */
let dealFlavorDraft = [];
function renderDealFlavorEditor() {
  const box = document.getElementById('dealFlavorEditor');
  if (!box) return;
  if (!dealFlavorDraft.length) { box.innerHTML = '<div style="color:var(--muted);font-size:13px">לא הוגדרו טעמים לפריט הזה.</div>'; return; }
  box.innerHTML = dealFlavorDraft.map((f, i) => `<div class="flavRow${f.out ? ' isOut' : ''}">
    <label class="flavTick"><input type="checkbox" ${f.out ? 'checked' : ''} onchange="setDealFlavorOut(${i},this.checked)"> אזל</label>
    <input class="input flavName" value="${esc(f.n)}" oninput="setDealFlavorName(${i},this.value)">
    <button class="iconBtn" onclick="removeDealFlavor(${i})">🗑️</button></div>`).join('');
}
function setDealFlavorOut(i, v) { dealFlavorDraft[i].out = v; renderDealFlavorEditor(); }
function setDealFlavorName(i, v) { dealFlavorDraft[i].n = v; }
function removeDealFlavor(i) { dealFlavorDraft.splice(i, 1); renderDealFlavorEditor(); }
function addDealFlavor() {
  const el = document.getElementById('newDealFlavor');
  const raw = el.value.trim(); if (!raw) return;
  raw.split(',').map(x => x.trim()).filter(Boolean).forEach(n => {
    if (!dealFlavorDraft.some(f => f.n === n)) dealFlavorDraft.push({ n, out: false });
  });
  el.value = ''; renderDealFlavorEditor();
}
function allDealFlavorsIn() { dealFlavorDraft.forEach(f => f.out = false); renderDealFlavorEditor(); }
function allDealFlavorsOut() { dealFlavorDraft.forEach(f => f.out = true); renderDealFlavorEditor(); }

/* תצוגה מקדימה של התמונה, כדי שאפשר יהיה לראות ולהסיר ולא רק להחליף */
function renderImgPreview(previewId, value) {
  const box = document.getElementById(previewId);
  if (!box) return;
  box.innerHTML = value ? `<img src="${esc(value)}" alt="">` : '<span>אין תמונה</span>';
}
function renderDealImgPreview() { renderImgPreview('dImgPreview', (document.getElementById('dImage') || {}).value); }
function clearDealImage() {
  const el = document.getElementById('dImage'); if (el) el.value = '';
  const up = document.getElementById('dUpload'); if (up) up.value = '';
  renderDealImgPreview();
}

/* ניהול המבצעים */
function renderAdminDeals() {
  const tb = document.getElementById('adminDeals');
  if (!tb) return;
  const tabs = document.getElementById('collTabs');
  if (tabs) tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.coll === adminCollection));
  tb.innerHTML = itemsOf(adminCollection).map(d => {
    const pct = discountPct(d);
    return `<tr>
      <td>${d.image ? `<img class="miniImg" src="${esc(d.image)}">` : `<div class="miniImg"></div>`}</td>
      <td><b>${esc(d.name)}</b></td>
      <td>${d.oldPrice ? fmt(d.oldPrice) : '—'}</td>
      <td>${fmt(d.price)}</td>
      <td>${pct ? pct + '%-' : '—'}</td>
      <td><button class="comboTag${d.combo ? ' on' : ''}" onclick="toggleCombo('${d.id}')" title="השתתפות במבצע 2 ב־100">${d.combo ? 'במבצע' : 'לא'}</button></td>
      <td><button class="iconBtn" onclick="editDeal('${d.id}')">✏️</button> <button class="iconBtn" onclick="deleteDeal('${d.id}')">🗑️</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="color:var(--muted)">עדיין לא נוספו פריטים באוסף הזה</td></tr>';
}

async function toggleCombo(id) {
  const it = dealsList().find(x => String(x.id) === String(id));
  if (!it) return;
  await supabase.from('deals').update({ combo: !it.combo }).eq('id', id);
  await loadData(); renderAll();
  toast(!it.combo ? 'הפריט נוסף למבצע' : 'הפריט הוסר מהמבצע');
}

function switchCollection(c) { adminCollection = c; renderAdminDeals(); }

async function toggleCatalogVisible() {
  const on = document.getElementById('setCatalogVisible').checked;
  await supabase.from('site_settings').update({ catalog_visible: on }).eq('id', 1);
  await loadData(); renderAll();
  toast(on ? 'הקטלוג בדף הבית גלוי' : 'הקטלוג בדף הבית מוסתר');
}

async function saveDealsSettings() {
  const v = id => (document.getElementById(id) || {}).value?.trim() || '';
  await supabase.from('site_settings').update({
    deals_title: v('setDealsTitle') || 'מבצעים',
    deals_subtitle: v('setDealsSubtitle'),
    toys_title: v('setToysTitle') || 'צעצועים',
    toys_subtitle: v('setToysSubtitle'),
    business_title: v('setBizTitle') || 'קטלוג לעסקים',
    business_subtitle: v('setBizSubtitle'),
    accessories_title: v('setAccTitle') || 'אביזרי סלולר',
    accessories_subtitle: v('setAccSubtitle'),
  }).eq('id', 1);
  await loadData(); renderAll(); toast('נשמר');
}

function fillDealCatList() {
  const dl = document.getElementById('dCatList');
  if (!dl) return;
  const opts = [...new Set(dealsList().map(d => d.category).filter(Boolean))];
  dl.innerHTML = opts.map(c => `<option value="${esc(c)}">`).join('');
}
function openDealModal() {
  setText('dealModalTitle', 'פריט חדש');
  ['dId','dName','dSku','dOldPrice','dPrice','dDesc','dBadge','dImage','dCategory','dBrand','dStock'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const cs = document.getElementById('dCollection'); if (cs) cs.value = adminCollection;
  const cm0 = document.getElementById('dCombo'); if (cm0) cm0.checked = false;
  dealFlavorDraft = []; renderDealFlavorEditor(); renderDealImgPreview(); fillDealCatList();
  document.getElementById('dealModal').classList.add('open');
}
function closeDealModal() { document.getElementById('dealModal').classList.remove('open'); }
function editDeal(id) {
  const d = dealsList().find(x => String(x.id) === String(id));
  if (!d) return;
  setText('dealModalTitle', 'עריכת פריט');
  const set = (k, v) => { const el = document.getElementById(k); if (el) el.value = v ?? ''; };
  set('dId', d.id); set('dName', d.name); set('dSku', d.sku);
  set('dOldPrice', d.oldPrice); set('dPrice', d.price);
  set('dDesc', d.desc); set('dBadge', d.badge); set('dImage', d.image);
  set('dCategory', d.category); set('dBrand', d.brand); set('dStock', d.stock);
  set('dCollection', d.collection || 'deals');
  const cm = document.getElementById('dCombo'); if (cm) cm.checked = d.combo === true;
  dealFlavorDraft = JSON.parse(JSON.stringify(d.flavors || []));
  renderDealFlavorEditor(); renderDealImgPreview(); fillDealCatList();
  document.getElementById('dealModal').classList.add('open');
}
async function saveDeal() {
  const id = fval('dId');
  const obj = {
    id: id || ('deal-' + Date.now()),
    name: fval('dName').trim() || 'פריט מבצע',
    sku: fval('dSku').trim(),
    oldPrice: Number(fval('dOldPrice')) || 0,
    price: Number(fval('dPrice')) || 0,
    desc: fval('dDesc').trim(),
    badge: fval('dBadge').trim(),
    image: fval('dImage').trim(),
    category: fval('dCategory').trim(),
    brand: fval('dBrand').trim(),
    stock: Number(fval('dStock')) || 0,
    collection: (document.getElementById('dCollection') || {}).value || adminCollection,
    combo: !!(document.getElementById('dCombo') || {}).checked,
    flavors: dealFlavorDraft.filter(f => f.n && f.n.trim()).map(f => ({ n: f.n.trim(), out: !!f.out })),
  };
  if (obj.oldPrice && obj.price && obj.price >= obj.oldPrice) {
    if (!confirm('מחיר המבצע אינו נמוך מהמחיר הקודם. לשמור בכל זאת?')) return;
  }
  const row = {
    name: obj.name, sku: obj.sku,
    old_price: obj.oldPrice, price: obj.price,
    description: obj.desc, badge: obj.badge, image_url: obj.image,
    category: obj.category, brand: obj.brand, stock: obj.stock,
    collection: obj.collection, combo: obj.combo, flavors: obj.flavors, sort_order: 0,
  };
  if (id) await supabase.from('deals').update(row).eq('id', id);
  else await supabase.from('deals').insert([row]);
  await loadData(); renderAll(); closeDealModal(); toast('המבצע נשמר');
}
async function deleteDeal(id) {
  if (!confirm('למחוק את פריט המבצע?')) return;
  await supabase.from('deals').delete().eq('id', id);
  await loadData(); renderAll(); toast('נמחק');
}
function dealImageUpload(e) {
  const f = e.target.files[0]; if (!f) return;
  resizeImage(f, 900, 900, .82).then(src => { fset('dImage', src); renderDealImgPreview(); toast('התמונה נטענה'); });
}

/* ===== מעבר בין הקטלוג לעמוד התקנון =====
   האתר הוא קובץ אחד, ולכן "עמוד" נפרד מושג בהחלפת תצוגה.
   הכתובת #takanon ניתנת לשליחה ולשמירה כמו כל עמוד רגיל. */
function openAccessibility() {
  closeMenu(); closeA11yMenu();
  document.body.classList.remove('showDeals', 'showContact');
  document.body.classList.add('showA11y');
  if (location.hash !== '#accessibility') history.pushState(null, '', '#accessibility');
  window.scrollTo(0, 0);
}
function closeAccessibility() {
  document.body.classList.remove('showA11y');
  if (location.hash === '#accessibility') history.pushState(null, '', location.pathname + location.search);
}
function openTerms() {
  closeMenu();
  document.body.classList.remove('showDeals', 'showContact', 'showAcc');
  document.body.classList.add('showTerms');
  if (location.hash !== '#takanon') history.pushState(null, '', '#takanon');
  window.scrollTo(0, 0);
}
function closeTerms() {
  document.body.classList.remove('showTerms');
  history.pushState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
}
function routeFromHash() {
  const h = location.hash;
  document.body.classList.toggle('showDeals', h === '#deals');
  document.body.classList.toggle('showContact', h === '#contact');
  document.body.classList.toggle('showA11y', h === '#accessibility');
  document.body.classList.toggle('showToys', h === '#toys');
  if (h === '#accessories' || h === '#business') {
    document.body.classList.remove('showTerms', 'showContact', 'showDeals');
    setTimeout(() => scrollToEl(h.slice(1)), 60);
  }
  if (h === '#accessories') window.scrollTo(0, 0);
  if (h === '#contact') window.scrollTo(0, 0);
  if (h === '#takanon') { document.body.classList.add('showTerms'); window.scrollTo(0, 0); }
  else if (!h.startsWith('#t')) { document.body.classList.remove('showTerms'); }
  if (h === '#deals') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', routeFromHash);
window.addEventListener('popstate', routeFromHash);

/* דרכי הכניסה היחידות לפאנל */
function checkAdminEntry() {
  if (location.hash === '#admin') {
    history.replaceState(null, '', location.pathname + location.search);
    requestAdmin();
  }
}
window.addEventListener('hashchange', checkAdminEntry);
checkAdminEntry();
routeFromHash();
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); requestAdmin(); }
});

function closeAdmin() { document.getElementById('adminOverlay').classList.add('hidden'); document.body.style.overflow = ''; }
function switchAdmin(page, btn) {
  document.querySelectorAll('.adminPage').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.side button').forEach(x => x.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

/* ===== Flavor Editor (Admin) ===== */
let flavorDraft = [];

function renderFlavorEditor() {
  const box = document.getElementById('flavorEditor');
  if (!flavorDraft.length) { box.innerHTML = '<div style="color:var(--muted);font-size:13px">לא הוגדרו טעמים למוצר הזה.</div>'; return; }
  box.innerHTML = flavorDraft.map((f, i) =>
    `<div class="flavRow${f.out ? ' isOut' : ''}">
      <label class="flavTick"><input type="checkbox" ${f.out ? 'checked' : ''} onchange="setFlavorOut(${i},this.checked)"> אזל</label>
      <input class="input flavName" value="${esc(f.n)}" oninput="setFlavorName(${i},this.value)">
      <button class="iconBtn" onclick="removeFlavor(${i})">🗑️</button>
    </div>`
  ).join('');
}
function setFlavorOut(i, v) { flavorDraft[i].out = v; renderFlavorEditor(); }
function setFlavorName(i, v) { flavorDraft[i].n = v; }
function removeFlavor(i) { flavorDraft.splice(i, 1); renderFlavorEditor(); }
function addFlavor() {
  const el = document.getElementById('newFlavor');
  const raw = el.value.trim();
  if (!raw) return;
  raw.split(',').map(x => x.trim()).filter(Boolean).forEach(n => {
    if (!flavorDraft.some(f => f.n === n)) flavorDraft.push({ n, out: false });
  });
  el.value = '';
  renderFlavorEditor();
}
function allFlavorsIn() { flavorDraft.forEach(f => f.out = false); renderFlavorEditor(); }
function allFlavorsOut() { flavorDraft.forEach(f => f.out = true); renderFlavorEditor(); }

/* ===== Product Modal ===== */
let editingProductId = null;

function openProductModal() {
  editingProductId = null;
  const title = document.getElementById('productModalTitle');
  if (title) title.textContent = 'מוצר חדש';
  ['pName','pSku','pPrice','pOldPrice','pBrand','pStock','pBadge','pDesc','pImage'].forEach(id => fset(id, ''));
  fset('pCategory', data.categories[0] || '');
  renderImgPreview('pImgPreview', '');
  flavorDraft = [];
  renderFlavorEditor();
  document.getElementById('productModal').classList.add('open');
}
function closeProductModal() { document.getElementById('productModal').classList.remove('open'); }

async function editProduct(id) {
  const p = data.products.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('productModalTitle').textContent = 'עריכת מוצר';
  const fields = [['pName', 'name'], ['pSku', 'sku'], ['pPrice', 'price'], ['pOldPrice', 'oldPrice'], ['pCategory', 'category'], ['pBrand', 'brand'], ['pStock', 'stock'], ['pBadge', 'badge'], ['pDesc', 'desc'], ['pImage', 'image']];
  for (const [elId, key] of fields) document.getElementById(elId).value = p[key] ?? '';
  flavorDraft = clone(p.flavors);
  renderFlavorEditor();
  document.getElementById('productModal').classList.add('open');
}

async function saveProduct() {
  const obj = {
    name: fval('pName').trim() || 'מוצר ללא שם',
    sku: fval('pSku').trim(),
    price: Number(fval('pPrice')) || 0,
    old_price: Number(fval('pOldPrice')) || 0,
    category: fval('pCategory'),
    brand: fval('pBrand').trim(),
    stock: Number(fval('pStock')) || 0,
    badge: fval('pBadge').trim(),
    description: fval('pDesc').trim(),
    image_url: fval('pImage').trim(),
  };

  if (editingProductId) {
    const { error } = await supabase.from('products').update(obj).eq('id', editingProductId);
    if (error) { alert('שגיאה בעדכון: ' + error.message); return; }
    // Sync flavors
    await supabase.from('product_flavors').delete().eq('product_id', editingProductId);
    if (flavorDraft.length) {
      const flavRows = flavorDraft.map((f, i) => ({ product_id: editingProductId, name: f.n, out: f.out, sort_order: i }));
      await supabase.from('product_flavors').insert(flavRows);
    }
  } else {
    const { data: newProd, error } = await supabase.from('products').insert([obj]).select().single();
    if (error) { alert('שגיאה בהוספה: ' + error.message); return; }
    if (flavorDraft.length) {
      const flavRows = flavorDraft.map((f, i) => ({ product_id: newProd.id, name: f.n, out: f.out, sort_order: i }));
      await supabase.from('product_flavors').insert(flavRows);
    }
  }

  await loadData();
  renderAll();
  closeProductModal();
  toast('המוצר נשמר');
}

async function duplicateProduct(id) {
  const p = data.products.find(x => x.id === id);
  if (!p) return;
  const { data: newProd, error } = await supabase.from('products').insert([{
    name: p.name + ' - עותק', sku: p.sku, price: p.price, old_price: p.oldPrice,
    category: p.category, brand: p.brand, stock: p.stock, badge: p.badge,
    description: p.desc, image_url: p.image,
  }]).select().single();
  if (error) { alert('שגיאה: ' + error.message); return; }
  if (p.flavors.length) {
    const flavRows = p.flavors.map((f, i) => ({ product_id: newProd.id, name: f.n, out: f.out, sort_order: i }));
    await supabase.from('product_flavors').insert(flavRows);
  }
  await loadData();
  renderAll();
  toast('המוצר שוכפל');
}

async function deleteProduct(id) {
  if (!confirm('למחוק את המוצר?')) return;
  await supabase.from('product_flavors').delete().eq('product_id', id);
  await supabase.from('products').delete().eq('id', id);
  await loadData();
  renderAll();
  toast('המוצר נמחק');
}

async function addCategory() {
  const v = fval('newCat').trim();
  if (!v || data.categories.includes(v)) return;
  const maxOrder = data.categories.length;
  await supabase.from('categories').insert([{ name: v, sort_order: maxOrder }]);
  fset('newCat', '');
  await loadData();
  renderAll();
  toast('הקטגוריה נוספה');
}

async function deleteCategory(c) {
  if (data.products.some(p => p.category === c)) {
    alert('יש מוצרים בקטגוריה הזאת. העבר אותם לקטגוריה אחרת לפני המחיקה.');
    return;
  }
  if (!confirm('למחוק את הקטגוריה?')) return;
  await supabase.from('categories').delete().eq('name', c);
  await loadData();
  renderAll();
  toast('הקטגוריה נמחקה');
}

/* ===== Settings Forms ===== */
function fillAdminForms() {
  const s = data.settings;
  const ids = {
    setHeroEyebrow: 'hero_eyebrow', setHeroTitle: 'hero_title', setHeroText: 'hero_text',
    setAboutTitle: 'about_title', setAboutText: 'about_text',
    setToysTitle: 'toys_title', setToysSubtitle: 'toys_subtitle', setBizTitle: 'business_title', setBizSubtitle: 'business_subtitle', setAccTitle: 'accessories_title', setAccSubtitle: 'accessories_subtitle', setContactTitle: 'contact_title', setContactText: 'contact_text', setDealsTitle: 'deals_title', setDealsSubtitle: 'deals_subtitle', setBusinessName: 'business_name', setBusinessSub: 'business_sub',
    setPhone: 'phone', setEmail: 'email', setWhatsapp: 'whatsapp', setFooterText: 'footer_text',
    setPrimary: 'primary_color', setPrimaryText: 'primary_color',
    setSecondary: 'secondary_color', setSecondaryText: 'secondary_color',
    setAccent: 'accent_color', setAccentText: 'accent_color',
  };
  for (const [id, k] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.value = s[k] || '';
  }
  const cv = document.getElementById('setCatalogVisible');
  if (cv) cv.checked = catalogVisible();

  const pr = document.getElementById('logoPreview');
  if (s.logo) { pr.src = s.logo; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
}

async function saveHomepage() {
  const cT = document.getElementById('setContactTitle');
  const cX = document.getElementById('setContactText');
  if (cT || cX) await supabase.from('site_settings').update({
    contact_title: cT ? cT.value.trim() : undefined,
    contact_text: cX ? cX.value.trim() : undefined,
  }).eq('id', 1);
  const s = data.settings;
  const updates = {
    hero_eyebrow: fval('setHeroEyebrow'),
    hero_title: fval('setHeroTitle'),
    hero_text: fval('setHeroText'),
    about_title: fval('setAboutTitle'),
    about_text: fval('setAboutText'),
  };
  await supabase.from('site_settings').update(updates).eq('id', 1);
  await loadData();
  renderAll();
  toast('השינויים נשמרו');
}

async function saveBusiness() {
  const updates = {
    business_name: fval('setBusinessName'),
    business_sub: fval('setBusinessSub'),
    phone: fval('setPhone'),
    email: fval('setEmail'),
    whatsapp: fval('setWhatsapp'),
    footer_text: fval('setFooterText'),
  };
  await supabase.from('site_settings').update(updates).eq('id', 1);
  await loadData();
  renderAll();
  toast('פרטי העסק נשמרו');
}

async function saveDesign() {
  const updates = {
    primary_color: fval('setPrimary') || fval('setPrimaryText'),
    secondary_color: fval('setSecondary') || fval('setSecondaryText'),
    accent_color: fval('setAccent') || fval('setAccentText'),
  };
  await supabase.from('site_settings').update(updates).eq('id', 1);
  await loadData();
  renderAll();
  toast('הצבעים עודכנו');
}

async function resetDesign() {
  const updates = { primary_color: '#7c5cff', secondary_color: '#21e6c1', accent_color: '#ff4fd8' };
  await supabase.from('site_settings').update(updates).eq('id', 1);
  await loadData();
  renderAll();
  toast('חזר לברירת מחדל');
}

/* ===== Image Upload ===== */
function resizeImage(file, maxW, maxH, quality) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const ratio = Math.min(maxW / w, maxH / h, 1);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function uploadLogo(e) {
  const f = e.target.files[0];
  if (!f) return;
  const src = await resizeImage(f, 500, 500, 0.9);
  await supabase.from('site_settings').update({ logo: src }).eq('id', 1);
  await loadData();
  renderAll();
  toast('הלוגו נשמר');
}

async function uploadHeroImage(e) {
  const f = e.target.files[0];
  if (!f) return;
  const src = await resizeImage(f, 1200, 1200, 0.85);
  await supabase.from('site_settings').update({ hero_image: src }).eq('id', 1);
  await loadData();
  renderAll();
  toast('תמונת הבאנר נשמרה');
}

async function removeHeroImage() {
  await supabase.from('site_settings').update({ hero_image: '' }).eq('id', 1);
  await loadData();
  renderAll();
  toast('תמונת הבאנר הוסרה');
}

async function productImageUpload(e) {
  const f = e.target.files[0];
  if (!f) return;
  const src = await resizeImage(f, 1000, 1000, 0.82);
  fset('pImage', src);
  toast('התמונה נטענה');
}

/* ===== CSV Import/Export ===== */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function flavorsToCell(fl) { return (fl || []).map(f => (f.out ? '!' : '') + f.n).join('|'); }
function flavorsFromCell(s) {
  return String(s || '').split('|').map(x => x.trim()).filter(Boolean)
    .map(x => x.startsWith('!') ? { n: x.slice(1).trim(), out: true } : { n: x, out: false })
    .filter(x => x.n);
}
function csvVal(v) { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

function exportData() {
  download('b2b-catalog-backup.json', JSON.stringify(data, null, 2), 'application/json');
}

function exportCSV() {
  const head = ['name', 'sku', 'price', 'oldPrice', 'category', 'brand', 'stock', 'badge', 'desc', 'image', 'flavors'];
  const rows = [head.join(','), ...data.products.map(p => head.map(k => csvVal(k === 'flavors' ? flavorsToCell(p.flavors) : k === 'oldPrice' ? p.oldPrice : k === 'desc' ? p.desc : k === 'image' ? p.image : p[k])).join(','))];
  download('products.csv', '\ufeff' + rows.join('\n'), 'text/csv;charset=utf-8');
}

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (ch === '"' && q && nx === '"') { cell += '"'; i++; }
    else if (ch === '"') q = !q;
    else if (ch === ',' && !q) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !q) {
      if (ch === '\r' && nx === '\n') i++;
      row.push(cell);
      if (row.some(x => x !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

async function importCSV(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    const rows = parseCSV(r.result.replace(/^\ufeff/, ''));
    if (rows.length < 2) return alert('הקובץ ריק');
    const head = rows[0].map(x => x.trim());
    // Delete existing products first
    await supabase.from('product_flavors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const o = {};
      head.forEach((h, j) => o[h] = row[j] ?? '');
      // Ensure category exists
      if (o.category && !data.categories.includes(o.category)) {
        await supabase.from('categories').insert([{ name: o.category, sort_order: data.categories.length }]);
        data.categories.push(o.category);
      }
      const { data: newProd } = await supabase.from('products').insert([{
        name: o.name || 'מוצר', sku: o.sku || '', price: Number(o.price) || 0, old_price: Number(o.oldPrice) || 0,
        category: o.category || data.categories[0] || 'כללי', brand: o.brand || '',
        stock: Number(o.stock) || 0, badge: o.badge || '', description: o.desc || '', image_url: o.image || '',
      }]).select().single();
      const flavs = flavorsFromCell(o.flavors);
      if (flavs.length && newProd) {
        await supabase.from('product_flavors').insert(flavs.map((f, idx) => ({ product_id: newProd.id, name: f.n, out: f.out, sort_order: idx })));
      }
    }
    await loadData();
    renderAll();
    toast('המוצרים יובאו מהקובץ');
  };
  r.readAsText(f);
}

async function importData(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const x = JSON.parse(r.result);
      if (!x.settings || !Array.isArray(x.products)) throw 0;
      // Update settings
      const s = x.settings;
      const supSet = {};
      if (s.businessName) supSet.business_name = s.businessName;
      if (s.businessSub) supSet.business_sub = s.businessSub;
      if (s.phone) supSet.phone = s.phone;
      if (s.email) supSet.email = s.email;
      if (s.whatsapp) supSet.whatsapp = s.whatsapp;
      if (s.footerText) supSet.footer_text = s.footerText;
      if (s.heroEyebrow) supSet.hero_eyebrow = s.heroEyebrow;
      if (s.heroTitle) supSet.hero_title = s.heroTitle;
      if (s.heroText) supSet.hero_text = s.heroText;
      if (s.aboutTitle) supSet.about_title = s.aboutTitle;
      if (s.aboutText) supSet.about_text = s.aboutText;
      if (s.primary) supSet.primary_color = s.primary;
      if (s.secondary) supSet.secondary_color = s.secondary;
      if (s.accent) supSet.accent_color = s.accent;
      if (Object.keys(supSet).length) await supabase.from('site_settings').update(supSet).eq('id', 1);
      await loadData();
      renderAll();
      toast('הגיבוי יובא בהצלחה');
    } catch (_) {
      alert('קובץ הגיבוי לא תקין');
    }
  };
  r.readAsText(f);
}

async function resetAll() {
  if (!confirm('לאפס את כל הנתונים לגרסה שמגיעה עם האתר?')) return;
  resetToSeed();
  await loadData();
  renderAll();
  toast('האתר אופס');
}
/* ===== Expose to window ===== */
Object.assign(window, {
  publishData, loadDataFile, openTerms, closeTerms,
  openDeals, closeDeals, openAcc, closeAcc, openBiz, closeBiz, openCombo, goSection, toggleCombo,
  openToys, closeToys, setToyCat, renderToys, scrollToEl, waDeal, saveDealsSettings, switchCollection, toggleCatalogVisible,
  openContact, closeContact, sendContact, pickTopic,
  setA11y, toggleA11yMenu, closeA11yMenu, openAccessibility, closeAccessibility,
  comboItems, comboEligible, comboBreakdown, dealsList, itemsOf, cartSubtotal, cartTotal, collectionLabel, itemCollection, openMenu, closeMenu, toggleMenu, goHome, goCatalog, goCategories, goAbout,
  addToCart, setQty, removeLine, clearCart, openCart, closeCart, flashFlavorPrompt,
  pickWhen, pickPay, submitOrder,
  openDealModal, closeDealModal, saveDeal, editDeal, deleteDeal, dealImageUpload,
  setDealFlavorOut, setDealFlavorName, removeDealFlavor, addDealFlavor,
  allDealFlavorsIn, allDealFlavorsOut, clearDealImage, renderDealImgPreview, requestAdmin, adminLogout, changeAdminPass,
  pickFlavor, waProduct, filterCategory, scrollToCatalog,
  openAdmin, closeAdmin, switchAdmin,
  openProductModal, closeProductModal, editProduct, saveProduct,
  duplicateProduct, deleteProduct, addCategory, deleteCategory,
  renderFlavorEditor, setFlavorOut, setFlavorName, removeFlavor, addFlavor,
  allFlavorsIn, allFlavorsOut,
  saveHomepage, saveBusiness, saveDesign, resetDesign,
  uploadLogo, uploadHeroImage, removeHeroImage, productImageUpload,
  exportData, exportCSV, importCSV, importData, resetAll,
  renderProducts,
});

/* ===== Init ===== */
async function init() {
  try {
    /* קודם מנסים שרת. אם אין, השכבה המקומית ממשיכה כרגיל. */
    await initStore();
    await loadData();
  } catch (err) {
    console.error('Database load failed:', err);
  }
  try {
    renderAll();
    applyA11y();
  } catch (err) {
    console.error('Render failed:', err);
  }

  // Init 3D hero (non-blocking, graceful failure)
  try {
    const hero3dContainer = document.getElementById('siteBg');
    if (hero3dContainer) initSiteBackground(hero3dContainer, heroBackdrop);
  } catch (err) {
    console.error('3D hero failed:', err);
  }

  // Color picker sync
  ['setPrimary', 'setSecondary', 'setAccent'].forEach(id => {
    const t = document.getElementById(id + 'Text');
    if (t) t.addEventListener('change', e => {
      if (/^#[0-9a-f]{6}$/i.test(e.target.value)) document.getElementById(id).value = e.target.value;
    });
  });

  // Flavor input enter key
  const nf = document.getElementById('newFlavor');
  if (nf) nf.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addFlavor(); }
  });

  // Age gate
  if (sessionStorage.getItem('b2bGateOk') !== '1') {
    showAgeGate();
  }
}

function showAgeGate() {
  const g = document.createElement('div');
  g.className = 'gate';
  g.innerHTML = `<div class="gateBox">
    <div class="gateLogo"><img src="${esc(data.settings.logo || brandLogo)}" alt="${esc(data.settings.business_name || '')}"></div>
    <h2>כניסה לבתי עסק בלבד</h2>
    <p>הקטלוג מיועד לעסקים מורשים לצורך רכישה סיטונאית. המוצרים מכילים ניקוטין, שהוא חומר ממכר, ומכירתם אסורה למי שטרם מלאו לו עשרים ואחת.</p>
    <button class="btn primary" id="gateYes">אני מעל גיל 21 ומייצג בית עסק</button>
  </div>`;
  document.body.appendChild(g);
  document.body.style.overflow = 'hidden';
  g.querySelector('#gateYes').onclick = function () {
    sessionStorage.setItem('b2bGateOk', '1');
    g.remove();
    document.body.style.overflow = '';
  };
}

init();
