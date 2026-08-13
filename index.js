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

// 2. Owner Dashboard Stats
app.get('/api/v1/owner/dashboard-stats', (req, res) => {
  res.json({
    success: true,
    data: {
      business_name: "Net Point",
      company_name: "Rahman Telecom",
      total_customers: 256,
      active_customers: 198,
      due_customers: 58,
      today_collection: 8450,
      monthly_collection: 124500,
      total_due: 28750,
      notification_count: 1,
      recent_payments: [
        {
          id: "PAY-101",
          customer_name: "WIFI-001 (রহিম)",
          phone: "01712345678",
          trx_id: "BK8F3K2L9",
          amount: 500,
          time: "আজ, ১০:৩০ AM",
          status: "Paid"
        }
      ],
      notifications: [
        {
          id: "N-01",
          title: "নতুন ডাটাবেজ টেস্ট",
          message: "আপনার ব্যাকএন্ড ভার্সেল সার্ভার সফলভাবে কাজ করছে!",
          created_at: "১০ মিনিট আগে"
        }
      ],
      settings: {
        business_name: "Net Point (Rahman Telecom)",
        helpline: "01995627922",
        bkash_number: "01712345678",
        nagad_number: "01812345678",
        router_ip: "192.168.88.1",
        router_port: "80",
        router_username: "admin",
        router_password: "password",
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
    data: [
      {
        id: "WIFI-001",
        name: "রহিম উদ্দিন",
        phone: "01712345678",
        address: "ঢাকা, মিরপুর-১০",
        package: "মাসিক ৫০০৳ (10 Mbps)",
        status: "অ্যাক্টিভ",
        expiry: "৩০ দিন বাকি",
        mac: "CC:B8:A8:11:22:33",
        amount: 500
      }
    ]
  });
});

app.post('/api/v1/customers/add', (req, res) => {
  const { name, phone, address, package_id } = req.body;
  res.json({
    success: true,
    data: { id: "WIFI-" + Date.now().toString().slice(-3), name, phone, address },
    message: "নতুন কাস্টমার সফলভাবে সেভ করা হয়েছে!"
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
    data: [
      {
        id: "TRX-101",
        refer_id: "REF-10296",
        trx_id: "BK9X1Y2Z3",
        customer_name: "রহিম উদ্দিন",
        phone: "01645678901",
        amount: 500,
        payment_method: "bKash",
        status: "পেন্ডিং",
        created_at: "১০ মিনিট আগে"
      }
    ]
  });
});

app.post('/api/v1/payments/manual-approve', (req, res) => {
  const { refer_id, trx_id } = req.body;
  res.json({
    success: true,
    message: `রেফারেন্স #${refer_id} এবং TrxID #${trx_id} ভেরিফাই হয়েছে এবং নেট চালু করা হয়েছে!`
  });
});

// 5. Packages API (মাসিক ৫০০৳ প্যাকেজ)
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
      total_income: 8450,
      total_transactions: 17,
      active_users: 198,
      payment_methods: {
        bkash: 6200,
        nagad: 1850,
        cash: 400
      },
      top_selling_packages: [
        {
          name: "মাসিক ৫০০৳ (10 Mbps)",
          sold_count: 17,
          total_earned: 8450,
          percentage: "100%"
        }
      ]
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
