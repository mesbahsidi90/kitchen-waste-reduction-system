import React, { useEffect, useState } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // جلب البيانات من السيرفر
  const fetchLogs = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/waste-logs");
      setLogs(res.data);
      setLoading(false);
    } catch (err) {
      console.error("فشل جلب البيانات:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // تحديث البيانات تلقائياً كل 5 ثوانٍ
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // حساب الإحصائيات الإجمالية
  const totalWeight = logs.reduce((sum, item) => sum + item.weight_kg, 0).toFixed(2);
  const totalCount = logs.length;

  // ألوان الأصناف
  const categoryColors = {
    "خضروات وفواكه": "#2e7d32",
    "لحوم ودواجن": "#c62828",
    "مخبوزات": "#f57c00",
    "وجبات مطبوخة": "#1565c0"
  };

  const chartData = Object.keys(categoryColors).map((cat) => {
    const weight = logs
      .filter((log) => log.category === cat)
      .reduce((sum, log) => sum + log.weight_kg, 0);
    return { category: cat, weight: parseFloat(weight.toFixed(2)) };
  });

  return (
    <div style={{
      padding: "30px",
      fontFamily: "system-ui, sans-serif",
      direction: "rtl",
      backgroundColor: "#121212",
      color: "#fff",
      minHeight: "100vh"
    }}>
      {/* الهيدر والعنوان الرئيسي */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <h1>📊 لوحة تحكم وإحصائيات الهدر (Dashboard)</h1>
        <button
          onClick={fetchLogs}
          style={{
            padding: "10px 20px",
            background: "#1e88e5",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          🔄 تحديث الآن
        </button>
      </div>

      {/* 1. كروت الملخص الإحصائي */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px" }}>
        <div style={{ background: "#1e1e1e", padding: "20px", borderRadius: "12px", borderRight: "6px solid #00e676" }}>
          <div style={{ color: "#aaa", fontSize: "16px" }}>إجمالي كتل الهدر المسجلة</div>
          <div style={{ fontSize: "40px", fontWeight: "bold", color: "#00e676", marginTop: "10px" }}>
            {totalWeight} <span style={{ fontSize: "20px", color: "#fff" }}>كجم</span>
          </div>
        </div>

        <div style={{ background: "#1e1e1e", padding: "20px", borderRadius: "12px", borderRight: "6px solid #29b6f6" }}>
          <div style={{ color: "#aaa", fontSize: "16px" }}>عدد عمليات الهدر المسجلة</div>
          <div style={{ fontSize: "40px", fontWeight: "bold", color: "#29b6f6", marginTop: "10px" }}>
            {totalCount} <span style={{ fontSize: "20px", color: "#fff" }}>عملية</span>
          </div>
        </div>
      </div>

      {/* 2. الرسم البياني لتوزيع الهدر حسب الأصناف */}
      <div style={{ background: "#1e1e1e", padding: "20px", borderRadius: "12px", marginBottom: "30px" }}>
        <h3 style={{ marginBottom: "20px" }}>📈 إجمالي الهدر حسب الصنف (بالكيلوجرام)</h3>
        <div style={{ width: "100%", height: "300px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="category" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip contentStyle={{ backgroundColor: "#333", border: "none", borderRadius: "8px", color: "#fff" }} />
              <Bar dataKey="weight" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={categoryColors[entry.category] || "#8884d8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. جدول السجلات التفصيلية */}
      <div style={{ background: "#1e1e1e", padding: "20px", borderRadius: "12px" }}>
        <h3 style={{ marginBottom: "20px" }}>📋 جدول التسجيلات التفصيلي</h3>
        {loading ? (
          <p>جاري تحميل البيانات...</p>
        ) : logs.length === 0 ? (
          <p style={{ color: "#aaa" }}>لا توجد تسجيلات حتى الآن.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #333", color: "#aaa" }}>
                  <th style={{ padding: "12px" }}>#</th>
                  <th style={{ padding: "12px" }}>معرف الميزان</th>
                  <th style={{ padding: "12px" }}>الوزن (كجم)</th>
                  <th style={{ padding: "12px" }}>الصنف</th>
                  <th style={{ padding: "12px" }}>السبب</th>
                  <th style={{ padding: "12px" }}>التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #2a2a2a" }}>
                    <td style={{ padding: "12px" }}>{log.id}</td>
                    <td style={{ padding: "12px", color: "#29b6f6" }}>{log.scale_id}</td>
                    <td style={{ padding: "12px", fontWeight: "bold", color: "#00e676" }}>{log.weight_kg} كجم</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        backgroundColor: categoryColors[log.category] || "#444",
                        fontSize: "14px"
                      }}>
                        {log.category}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>{log.reason}</td>
                    <td style={{ padding: "12px", color: "#aaa", fontSize: "14px" }}>
                      {new Date(log.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}