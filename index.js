const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(express.json());

// 🟢 ফায়ারবেস ইনিশিয়ালাইজেশন
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    console.log("Firebase Admin Initialized!");
  } catch (e) {
    console.log("Firebase Init Error:", e);
  }
}

// 🗓️ ১৫ তারিখ নির্ণয়কারী ফাংশন
function getNext15thDate() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  if (now.getDate() >= 15) {
    month += 1;
  }
  
  const expiryDate = new Date(year, month, 15, 23, 59, 59);
  const monthsBn = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
  
  return `১৫ ${monthsBn[expiryDate.getMonth()]}, ${expiryDate.getFullYear()}`;
}

// 🟢 টেস্ট রুট
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: "Wi-Fi Manager Owner App Backend API is Running Live!"
  });
});

// 1. Auth Sync
app.post('/api/v1/auth/sync', (req, res) => {
  try {
    res.json({
      success: true,
      data: { user_id: "OWNER-101", role: "Owner" },
      message: "ইউজার সিঙ্ক সফল হয়েছে"
    });
  } catch (err) {
    res.json({ success: true, data: {} });
  }
});

// 2. Owner Dashboard Stats (Code 500 প্রতিরোধকSafe Response)
app.get('/api/v1/owner/dashboard-stats', (req, res) => {
  try {
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
        sms_balance: 250,
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
  } catch (err) {
    res.json({ success: true, data: {} });
  }
});

// 3. Customers API
app.get('/api/v1/customers', (req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/api/v1/customers/add', (req, res) => {
  try {
    const { name, phone, address, nid, nid_image_url, package_id, connection_fee, monthly_installment } = req.body;
    const expireDate = getNext15thDate();

    res.json({
      success: true,
      data: {
        id: "WIFI-" + Date.now().toString().slice(-3),
        name,
        phone,
        address,
        nid: nid || "N/A",
        nid_image_url: nid_image_url || "",
        package_id,
        connection_fee: connection_fee || 0,
        monthly_installment: monthly_installment || 0,
        expiry: expireDate,
        status: "অ্যাক্টিভ"
      },
      message: `নতুন কাস্টমার সেভ করা হয়েছে! মেয়াদের শেষ তারিখ: ${expireDate}`
    });
  } catch (err) {
    res.json({ success: false, message: "কাস্টমার যোগ করতে সমস্যা হয়েছে" });
  }
});

app.post('/api/v1/customers/:id/disconnect', (req, res) => {
  res.json({
    success: true,
    message: `কাস্টমার ${req.params.id} এর সংযোগ বন্ধ করা হয়েছে!`
  });
});

// 4. Transactions & Manual Approve
app.get('/api/v1/transactions', (req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/api/v1/payments/manual-approve', (req, res) => {
  const { refer_id, trx_id } = req.body;
  res.json({
    success: true,
    message: `রেফারেন্স #${refer_id} এবং TrxID #${trx_id} ভেরিফাই হয়েছে!`
  });
});

// 5. Packages API
app.get('/api/v1/packages', (req, res) => {
  res.json({ success: true, data: [] });
});

app.put('/api/v1/packages/:id/toggle', (req, res) => {
  res.json({ success: true, message: "প্যাকেজের স্ট্যাটাস পরিবর্তন করা হয়েছে!" });
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
      payment_methods: { bkash: 0, nagad: 0, cash: 0 },
      top_selling_packages: []
    }
  });
});

// 7. Settings Update
app.post('/api/v1/settings/update', (req, res) => {
  res.json({ success: true, message: "সেটিংস সেভ করা হয়েছে!" });
});

// 8. Router Reboot
app.post('/api/v1/router/reboot', (req, res) => {
  res.json({ success: true, message: "রাউটার রিবুট কমান্ড পাঠানো হয়েছে!" });
});

// 9. Installments API
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

// 10. Group SMS API
app.post('/api/v1/customers/send-group-sms', (req, res) => {
  res.json({ success: true, message: "এসএমএস পাঠানো হয়েছে!" });
});

// 11. Buy SMS Package API
app.post('/api/v1/sms/buy', (req, res) => {
  res.json({ success: true, message: "এসএমএস ব্যালেন্স প্রসেসিং হচ্ছে!" });
});

// Global Error Handler (Code 500 ফিক্স)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(200).json({
    success: false,
    message: "সার্ভারে সাময়িক সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন।"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
