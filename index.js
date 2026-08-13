const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// 🟢 টেস্ট রুট
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: "Wi-Fi Manager Owner App Backend API is Running Live on Vercel!"
  });
});

// 1. Auth Sync
app.post('/api/v1/auth/sync', (req, res) => {
  res.json({
    success: true,
    data: { user_id: "OWNER-101", role: "Owner" },
    message: "ইউজার সিঙ্ক সফল হয়েছে"
  });
});

// 2. Owner Dashboard Stats (প্রাথমিক অবস্থায় ০ দিয়ে শুরু)
app.get('/api/v1/owner/dashboard-stats', (req, res) => {
  res.json({
    success: true,
    data: {
      business_name: "Net Point",
      company_name: "Telecom",
      total_customers: 0,
      active_customers: 0,
      due_customers: 0,
      today_collection: 0,
      monthly_collection: 0,
      total_due: 0,
      notification_count: 0,
      recent_payments: [],
      notifications: [],
      settings: {
        business_name: "Net Point",
        helpline: "",
        bkash_number: "",
        nagad_number: "",
        router_ip: "192.168.88.1",
        router_port: "80",
        router_username: "admin",
        router_password: "",
        auto_payment: true,
        notification_enabled: true
      }
    }
  });
});

// 3. Customers API
app.get('/api/v1/customers', (req, res) => {
  res.json({
    success: true,
    data: []
  });
});

app.post('/api/v1/customers/add', (req, res) => {
  const { name, phone, address, package_id, connection_fee, monthly_installment } = req.body;
  res.json({
    success: true,
    data: {
      id: "WIFI-" + Date.now().toString().slice(-3),
      name,
      phone,
      address,
      package_id,
      connection_fee: connection_fee || 0,
      monthly_installment: monthly_installment || 0
    },
    message: "নতুন কাস্টমার ও কিস্তির হিসাব সফলভাবে সেভ করা হয়েছে!"
  });
});

app.post('/api/v1/customers/:id/disconnect', (req, res) => {
  res.json({
    success: true,
    message: `কাস্টমার ${req.params.id} এর সংযোগ বন্ধ করা হয়েছে!`
  });
});

// 4. Transactions & Manual Approve
app.get('/api/v1/transactions', (req, res) => {
  res.json({
    success: true,
    data: []
  });
});

app.post('/api/v1/payments/manual-approve', (req, res) => {
  const { refer_id, trx_id } = req.body;
  res.json({
    success: true,
    message: `রেফারেন্স #${refer_id} এবং TrxID #${trx_id} ভেরিফাই হয়েছে এবং নেট চালু করা হয়েছে!`
  });
});

// 5. Packages API (ডিফল্ট ১টি একটিভ প্যাকেজ দেওয়া হলো যেন ড্রপডাউনে লাল এরর না দেখায়)
app.get('/api/v1/packages', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: "PKG-MONTHLY-500",
        name: "মাসিক ৫০০৳ (10 Mbps)",
        price: 500,
        durationValue: 1,
        durationUnit: "মাস",
        downloadSpeed: 10,
        uploadSpeed: 5,
        mikrotikProfile: "profile_500_10m",
        isActive: true
      }
    ]
  });
});

app.put('/api/v1/packages/:id/toggle', (req, res) => {
  res.json({
    success: true,
    message: "প্যাকেজের স্ট্যাটাস পরিবর্তন করা হয়েছে!"
  });
});

// 6. Reports API
app.get('/api/v1/reports', (req, res) => {
  const range = req.query.range || "today";
  res.json({
    success: true,
    data: {
      range: range,
      total_income: 0,
      total_transactions: 0,
      active_users: 0,
      payment_methods: {
        bkash: 0,
        nagad: 0,
        cash: 0
      },
      top_selling_packages: []
    }
  });
});

// 7. Settings Update
app.post('/api/v1/settings/update', (req, res) => {
  res.json({
    success: true,
    message: "সিস্টেম ও রাউটার সেটিংস সফলভাবে সেভ করা হয়েছে!"
  });
});

// 8. Router Reboot Command
app.post('/api/v1/router/reboot', (req, res) => {
  res.json({
    success: true,
    message: "মাইক্রোটিক রাউটার রিবুট কমান্ড সফলভাবে পাঠানো হয়েছে!"
  });
});

// 9. Installments Management API (কিস্তি হিসাব এপিআই)
app.get('/api/v1/installments', (req, res) => {
  res.json({
    success: true,
    data: {
      total_collected: 0,
      total_due: 0,
      active_installment_customers: 0,
      installments: []
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
