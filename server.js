/*
  שרת קטן לאתר המעשנת.
  מגיש את האתר, ומספק ממשק לקריאה ולשמירה של נתוני הקטלוג.
  השמירה מוגנת בסיסמה שיושבת במשתנה סביבה בצד השרת — כך שהיא
  אינה נחשפת בקוד שרץ בדפדפן, בניגוד למצב בגרסה הסטטית.
*/
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

/* תיקיית הנתונים. ב-Render יש לחבר דיסק קבוע לנתיב הזה,
   אחרת כל פריסה מחדש תאפס את השינויים. */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const SEED_FILE = path.join(__dirname, 'seed', 'data.json');
const ADMIN_PASS = process.env.ADMIN_PASS || '';

app.use(express.json({ limit: '25mb' }));
app.disable('x-powered-by');

/* אם אין עדיין קובץ נתונים, נוצר עותק מנתוני הבסיס */
async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(DATA_FILE); }
  catch { await fs.copyFile(SEED_FILE, DATA_FILE); }
}

app.get('/api/data', async (req, res) => {
  try {
    await ensureData();
    res.type('application/json').send(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (e) {
    res.status(500).json({ error: 'לא ניתן לקרוא את הנתונים' });
  }
});

app.post('/api/data', async (req, res) => {
  if (!ADMIN_PASS) return res.status(503).json({ error: 'סיסמת ניהול לא הוגדרה בשרת' });
  if (req.get('x-admin-pass') !== ADMIN_PASS) return res.status(401).json({ error: 'סיסמה שגויה' });
  const body = req.body;
  if (!body || !Array.isArray(body.products) || !Array.isArray(body.deals)) {
    return res.status(400).json({ error: 'מבנה נתונים לא תקין' });
  }
  try {
    await ensureData();
    /* גיבוי לפני כל כתיבה, כדי ששמירה שגויה לא תמחק הכול */
    try { await fs.copyFile(DATA_FILE, DATA_FILE + '.bak'); } catch {}
    await fs.writeFile(DATA_FILE, JSON.stringify(body, null, 1), 'utf8');
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: 'השמירה נכשלה' });
  }
});

/* בדיקת סיסמה בלבד, בלי לשמור */
app.post('/api/login', (req, res) => {
  if (!ADMIN_PASS) return res.status(503).json({ error: 'סיסמת ניהול לא הוגדרה בשרת' });
  res.json({ ok: req.get('x-admin-pass') === ADMIN_PASS });
});

/* האם הנתונים שורדים פריסה מחדש. בלי DATA_DIR מפורש הם אינם שורדים,
   כי מערכת הקבצים של המכונה נמחקת בכל פריסה. */
const PERSISTENT = !!process.env.DATA_DIR;

app.get('/api/status', (req, res) => res.json({
  ok: true,
  persistent: PERSISTENT,
  adminConfigured: !!ADMIN_PASS,
}));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, p) {
    /* נכסים עם חתימה בשם נשמרים במטמון לאורך זמן, העמוד עצמו לא —
       כך עדכון עולה מיד ולא נתקע במטמון של הדפדפן. */
    if (/\.(js|css|webp|jpg|png|woff2?)$/.test(p)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('השרת עלה על פורט ' + PORT));
