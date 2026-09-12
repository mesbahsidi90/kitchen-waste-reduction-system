import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [weight, setWeight] = useState("1.2");
  const [category, setCategory] = useState("خضروات وفواكه");
  const [reason, setReason] = useState("تالف / منتهي الصلاحية");
  const [status, setStatus] = useState("");

  const categories = [
    { name: "خضروات وفواكه", color: "#2e7d32" },
    { name: "لحوم ودواجن", color: "#c62828" },
    { name: "مخبوزات", color: "#f57c00" },
    { name: "وجبات مطبوخة", color: "#1565c0" }
  ];

  const reasons = [
    "تالف / منتهي الصلاحية",
    "بقايا تحضير (Trim)",
    "بقايا صحون الزبائن",
    "خطأ طهي"
  ];

  const handleSend = async () => {
    setStatus("جاري التسجيل...");
    try {
      const res = await axios.post("http://localhost:5000/api/waste-log", {
        scale_id: "SCALE_01",
        weight_kg: parseFloat(weight),
        category,
        reason
      });
      if (res.data.status === "success") {
        setStatus("✅ تم تسليط الهدر بنجاح!");
        setTimeout(() => setStatus(""), 3000);
      }
    } catch (err) {
      setStatus("❌ فشل الاتصال بالسيرفر!");
    }
  };

  return (
    <div style={{
      padding: "20px",
      fontFamily: "system-ui, sans-serif",
      direction: "rtl",
      maxWidth: "800px",
      margin: "auto",
      color: "#fff",
      userSelect: "none"
    }}>
      {/* شاشة العرض الرئيسية للوزن والمحاكاة */}
      <div style={{
        background: "#1e1e1e",
        padding: "20px",
        borderRadius: "15px",
        textAlign: "center",
        marginBottom: "20px",
        border: "2px solid #333"
      }}>
        <div style={{ fontSize: "18px", color: "#aaa" }}>الوزن الملتقط من الميزان</div>
        <div style={{ fontSize: "56px", fontWeight: "bold", color: "#00e676", margin: "10px 0" }}>
          {weight} <span style={{ fontSize: "24px", color: "#fff" }}>كجم</span>
        </div>
        <button 
          onClick={() => setWeight((Math.random() * 3 + 0.2).toFixed(1))}
          style={{
            background: "#333",
            color: "#fff",
            border: "1px solid #555",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "14px",
            cursor: "pointer"
          }}
        >
          🔄 محاكاة تغيير الوزن
        </button>
      </div>

      {/* 1. أزرار اختيار صنف الهدر */}
      <h3 style={{ marginBottom: "10px" }}>1. اختر نوع الهدر:</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "25px" }}>
        {categories.map((item) => (
          <button
            key={item.name}
            onClick={() => setCategory(item.name)}
            style={{
              padding: "25px 15px",
              fontSize: "20px",
              fontWeight: "bold",
              background: category === item.name ? item.color : "#2a2a2a",
              color: "#fff",
              border: category === item.name ? "4px solid #fff" : "2px solid #444",
              borderRadius: "12px",
              cursor: "pointer",
              boxShadow: category === item.name ? "0 0 15px " + item.color : "none",
              transition: "all 0.2s"
            }}
          >
            {item.name}
          </button>
        ))}
      </div>

      {/* 2. أزرار اختيار السبب */}
      <h3 style={{ marginBottom: "10px" }}>2. اختر السبب:</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "25px" }}>
        {reasons.map((item) => (
          <button
            key={item}
            onClick={() => setReason(item)}
            style={{
              padding: "18px 10px",
              fontSize: "16px",
              background: reason === item ? "#424242" : "#1a1a1a",
              color: "#fff",
              border: reason === item ? "2px solid #00e676" : "1px solid #333",
              borderRadius: "10px",
              cursor: "pointer"
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* 3. زر الإرسال الضخم */}
      <button
        onClick={handleSend}
        style={{
          width: "100%",
          padding: "25px",
          background: "#00c853",
          color: "#fff",
          border: "none",
          fontSize: "24px",
          fontWeight: "bold",
          borderRadius: "15px",
          cursor: "pointer",
          boxShadow: "0 5px 20px rgba(0,200,83,0.4)"
        }}
      >
        ✅ تأكيد وتسجيل الهدر
      </button>

      {status && (
        <div style={{
          marginTop: "20px",
          padding: "15px",
          textAlign: "center",
          background: status.includes("✅") ? "#1b5e20" : "#b71c1c",
          borderRadius: "10px",
          fontSize: "18px",
          fontWeight: "bold"
        }}>
          {status}
        </div>
      )}
    </div>
  );
}