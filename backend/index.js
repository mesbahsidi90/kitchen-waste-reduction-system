const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
app.use(cors());
app.use(express.json());

let db;

// 1. إنشاء وتهيئة قاعدة البيانات تلقائياً
(async () => {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  // إنشاء جدول حفظ الهدر إذا لم يكن موجوداً
  await db.exec(`
    CREATE TABLE IF NOT EXISTS waste_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scale_id TEXT,
      weight_kg REAL,
      category TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('📦 قاعدة البيانات SQLite متصلة وجاهزة!');
})();

// 2. نقطة حفظ قراءة جديدة
app.post('/api/waste-log', async (req, res) => {
  const { scale_id, weight_kg, category, reason } = req.body;
  
  try {
    await db.run(
      `INSERT INTO waste_logs (scale_id, weight_kg, category, reason) VALUES (?, ?, ?, ?)`,
      [scale_id, weight_kg, category, reason]
    );
    console.log(`✅ تم حفظ هدر جديد: ${weight_kg} كجم - ${category}`);
    res.json({ status: 'success', message: 'تم التخزين في قاعدة البيانات' });
  } catch (error) {
    console.error('❌ خطأ في الحفظ:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 3. نقطة جلب كافة التقارير (لـ Dashboard)
app.get('/api/waste-logs', async (req, res) => {
  try {
    const logs = await db.all('SELECT * FROM waste_logs ORDER BY created_at DESC');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على: http://localhost:${PORT}`));