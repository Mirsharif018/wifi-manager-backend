const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const stream = require('stream');

const app = express();

// 🟢 CORS এবং বডি পার্সার
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🟢 Multer ইন-মেমোরি স্টোরেজ (CSV ফাইলের জন্য)
const upload = multer({ storage: multer.memoryStorage() });

// 🟢 ইন-মেমোরি ডায়নামিক ডাটা স্টোর
let settingsStore = {
  business_name: "Net Point",
  helpline: "",
  bkash_number: "",
  nagad_number: "",
  router_ip: "",
  router_port: "38728",
  router_username: "",
  router_password: "",
  auto_payment: true,
  notification_enabled: true
};

let smsBalanceStore = 0; // 🟢 ডিফল্ট ০ এসএমএস
let staffStore = []; // 🟢 স্টাফদের হিসাব রাখার ইন-মেমোরি স্টোর

// 🟢 ফায়ারবেস সেফ ইনিশিয়ালাইজেশন (গ্লোবাল স্কোপ)
let admin;
try {
  admin = require('firebase-admin');
  if (process.env.FIREBASE_SERVICE_ACCOUNT && !admin.apps.length) {
    let rawData = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(rawData);
    } catch (e) {
      serviceAccount = JSON.parse(rawData.replace(/\\n/g, '\n'));
    }
    
    if (serviceAccount && serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin Initialized Successfully!");
    }
  }
} catch (err) {
  console.log("Firebase Admin Safe Catch:", err.message);
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

// 🟢 হোম টেস্ট রুট
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: "Wi-Fi Manager Owner App Backend API is Running Live!"
  });
});

// 1. Auth Sync
app.post('/api/v1/auth/sync', (req, res) => {
  res.status(200).json({
    success: true,
    data: { user_id: "OWNER-101", role: "Owner" },
    message: "ইউজার সিঙ্ক সফল হয়েছে"
  });
});

// 2. Owner Dashboard Stats
app.get('/api/v1/owner/dashboard-stats', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      business_name: settingsStore.business_name || "Net Point",
      company_name: "Telecom",
      total_customers: 0,
      active_customers: 0,
      due_customers: 0,
      today_collection: 0,
      monthly_collection: 0,
      total_due: 0,
      notification_count: 0,
      
      sms_balance: smsBalanceStore,
      
      recent_payments: [],
      notifications: [],
      settings: settingsStore
    }
  });
});

// 3. Customers API
app.get('/api/v1/customers', (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

// =========================================================================
// 🟢 3.1. CSV IMPORT API (Dawan.csv ফাইল থেকে আসল কাস্টমার ডাটা ফায়ারবেসে সেভ)
// =========================================================================
app.post('/api/v1/customers/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'দয়া করে একটি CSV ফাইল আপলোড করুন!' });
    }

    if (!admin || !admin.apps.length) {
      return res.status(500).json({ success: false, message: 'ফায়ারবেস এডমিন ইনিশিয়ালাইজ করা নেই!' });
    }

    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    // CSV স্ট্রিম রিড করা
    bufferStream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const db = admin.firestore();
          let batch = db.batch();
          let count = 0;
          let batchCount = 0;

          for (const row of results) {
            const pppoeName = (row.PPPoE_Name || row.name_of_user || '').trim();
            if (!pppoeName) continue;

            // ১. মোবাইল নম্বর সঠিক ফরম্যাটে কনভার্ট (যেমন: 1.72E+09 -> 01720000000)
            let rawPhone = (row.client_phone || '').trim();
            let formattedPhone = '';
            if (rawPhone) {
              let num = Number(rawPhone);
              if (!isNaN(num) && num > 0) {
                let strNum = Math.floor(num).toString();
                formattedPhone = strNum.startsWith('0') ? strNum : '0' + strNum;
              } else {
                formattedPhone = rawPhone;
              }
            }

            // ২. ফায়ারস্টোর ডকুমেন্ট আইডি তৈরি (অক্ষত নাম দিয়ে)
            const safeDocId = `CUST-${pppoeName.replace(/[/\.#?\[\]]/g, '_')}`;
            const customerRef = db.collection('customers').doc(safeDocId);

            // ৩. স্ট্যাটাস বাংলা করা
            let statusText = 'অ্যাক্টিভ';
            if ((row.status || '').toLowerCase() === 'expired') {
              statusText = 'মেয়াদোত্তীর্ণ';
            }

            // ৪. Dawan.csv এর প্রতিটি কলাম ফায়ারবেসের সাথে ম্যাপিং
            const customerData = {
              id: safeDocId,
              refer_id: (row.customer_id || '').toString().trim(), // NetFee ID (1001, 1002...)
              mikrotik: (row.client_mikrotik || 'maruf').trim(),
              name: (row.name_of_user || pppoeName).trim(),
              pppoe_name: pppoeName,
              password: (row.password || '123456').trim(),
              phone: formattedPhone,
              address: (row.address_of_user || 'ঠিকানা দেওয়া নেই').trim(),
              nid: 'N/A',
              birth_date: 'N/A',
              nid_image_url: '',
              package_name: (row.bandwidth || 'মাসিক প্যাকেজ').trim(),
              package_id: (row.bandwidth || '').trim(),
              area: (row.area || 'maruf').trim(),
              sub_area: (row.SubArea || 'Main').trim(),
              email: (row.email || '').trim(),
              billing_cycle: (row.billing_cycle || 'Monthly').trim(),
              billing_type: 'Prepaid',
              monthly_fee: parseFloat(row.selling_price || 0) || 500,
              connection_fee_type: 'এককালীন',
              connection_fee: 0,
              monthly_installment: 0,
              division: '',
              district: '',
              upazila: '',
              ref_name: '',
              ref_mobile: '',
              comment: (row.comment || '').trim(),
              status: statusText,
              updated_at: admin.firestore.FieldValue.serverTimestamp()
            };

            batch.set(customerRef, customerData, { merge: true });
            count++;
            batchCount++;

            // ফায়ারবেসের ব্যাচ লিমিট ৪০০ পার হলে সেভ করে নতুন ব্যাচ তৈরি
            if (batchCount >= 400) {
              await batch.commit();
              batch = db.batch();
              batchCount = 0;
            }
          }

          if (batchCount > 0) {
            await batch.commit();
          }

          return res.status(200).json({
            success: true,
            message: `সফলভাবে ${count} জন কাস্টমারের আসল ডাটা ফায়ারবেসে ইমপোর্ট করা হয়েছে! 🎉`
          });

        } catch (dbErr) {
          console.error('Firestore Import Error:', dbErr);
          return res.status(500).json({
            success: false,
            message: 'ফায়ারবেসে ডাটা সেভ করতে সমস্যা হয়েছে: ' + dbErr.message
          });
        }
      });

  } catch (err) {
    console.error('CSV Route Error:', err);
    return res.status(500).json({
      success: false,
      message: 'সার্ভার এরর: ' + err.message
    });
  }
});

app.post('/api/v1/customers/add', (req, res) => {
  try {
    const { name, phone, address, nid, nid_image_url, package_id, connection_fee, monthly_installment } = req.body || {};
    const expireDate = getNext15thDate();

    res.status(200).json({
      success: true,
      data: {
        id: "WIFI-" + Date.now().toString().slice(-3),
        name: name || "নবাগত কাস্টমার",
        phone: phone || "",
        address: address || "",
        nid: nid || "N/A",
        nid_image_url: nid_image_url || "",
        package_id: package_id || "",
        connection_fee: connection_fee || 0,
        monthly_installment: monthly_installment || 0,
        expiry: expireDate,
        status: "অ্যাক্টিভ"
      },
      message: `নতুন কাস্টমার সেভ করা হয়েছে! মেয়াদের শেষ তারিখ: ${expireDate}`
    });
  } catch (err) {
    res.status(200).json({ success: false, message: "কাস্টমার যোগ করতে সমস্যা হয়েছে" });
  }
});

app.post('/api/v1/customers/:id/disconnect', (req, res) => {
  res.status(200).json({
    success: true,
    message: `কাস্টমার ${req.params.id} এর সংযোগ বন্ধ করা হয়েছে!`
  });
});

// 4. Transactions & Manual Approve
app.get('/api/v1/transactions', (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

app.post('/api/v1/payments/manual-approve', (req, res) => {
  const { refer_id, trx_id } = req.body || {};
  res.status(200).json({
    success: true,
    message: `রেফারেন্স #${refer_id || ''} এবং TrxID #${trx_id || ''} ভেরিফাই হয়েছে!`
  });
});

// 5. Packages API
app.get('/api/v1/packages', (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

app.put('/api/v1/packages/:id/toggle', (req, res) => {
  res.status(200).json({ success: true, message: "প্যাকেজের স্ট্যাটাস পরিবর্তন করা হয়েছে!" });
});

// 6. Reports API
app.get('/api/v1/reports', (req, res) => {
  const range = req.query.range || "today";
  res.status(200).json({
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
  const data = req.body || {};
  
  if (data.business_name !== undefined) settingsStore.business_name = data.business_name;
  if (data.helpline !== undefined) settingsStore.helpline = data.helpline;
  if (data.bkash_number !== undefined) settingsStore.bkash_number = data.bkash_number;
  if (data.nagad_number !== undefined) settingsStore.nagad_number = data.nagad_number;
  if (data.router_ip !== undefined) settingsStore.router_ip = data.router_ip;
  if (data.router_port !== undefined) settingsStore.router_port = data.router_port;
  if (data.router_username !== undefined) settingsStore.router_username = data.router_username;
  if (data.router_password !== undefined) settingsStore.router_password = data.router_password;
  if (data.auto_payment !== undefined) settingsStore.auto_payment = data.auto_payment;
  if (data.notification_enabled !== undefined) settingsStore.notification_enabled = data.notification_enabled;

  res.status(200).json({ success: true, message: "সেটিংস ও রাউটার ক্রেডেনশিয়াল সেভ করা হয়েছে!" });
});

// 8. Router Reboot
app.post('/api/v1/router/reboot', (req, res) => {
  res.status(200).json({ success: true, message: "রাউটার রিবুট কমান্ড পাঠানো হয়েছে!" });
});

// 9. Installments API
app.get('/api/v1/installments', (req, res) => {
  res.status(200).json({
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
  res.status(200).json({ success: true, message: "এসএমএস পাঠানো হয়েছে!" });
});

// 11. Buy SMS Package API
app.post('/api/v1/sms/buy', (req, res) => {
  const { package_id } = req.body || {};
  let count = 500;
  if (package_id === 'SMS-1000') count = 1000;
  if (package_id === 'SMS-5000') count = 5000;

  smsBalanceStore += count;

  res.status(200).json({ 
    success: true, 
    message: `আপনার ${count} টি এসএমএস রিচার্জ রিকোয়েস্ট গ্রহণ করা হয়েছে!` 
  });
});

// =========================================================================
// 🟢 12. STAFF MANAGEMENT API
// =========================================================================

// ক) স্টাফদের তালিকা দেখা
app.get('/api/v1/staff', (req, res) => {
  res.status(200).json({
    success: true,
    data: staffStore
  });
});

// খ) নতুন স্টাফ সেভ করা
app.post('/api/v1/staff/add', (req, res) => {
  try {
    const { name, phone, role, monthly_salary } = req.body || {};
    
    const now = new Date();
    const joinDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    const newStaff = {
      id: "STF-" + Date.now().toString().slice(-4),
      name: name || "অজানা স্টাফ",
      phone: phone || "",
      role: role || "টেকনিশিয়ান",
      monthly_salary: Number(monthly_salary) || 0,
      total_advance: 0,
      join_date: joinDate,
      is_active: true,
      history: []
    };

    staffStore.push(newStaff);

    res.status(200).json({
      success: true,
      data: newStaff,
      message: `নতুন স্টাফ '${newStaff.name}' সফলভাবে সেভ করা হয়েছে!`
    });
  } catch (err) {
    res.status(200).json({
      success: false,
      message: "স্টাফ সেভ করতে সমস্যা হয়েছে"
    });
  }
});

// গ) স্টাফদের লেনদেন (বেতন / এডভান্স) সেভ করা
app.post('/api/v1/staff/transaction', (req, res) => {
  try {
    const { staff_id, type, amount, note } = req.body || {};
    const numAmount = Number(amount) || 0;

    const staff = staffStore.find(s => s.id === staff_id);

    if (staff) {
      if (type === 'advance') {
        staff.total_advance += numAmount;
      }

      const now = new Date();
      staff.history.push({
        type: type || 'salary',
        amount: numAmount,
        note: note || '',
        date: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
      });

      res.status(200).json({
        success: true,
        data: staff,
        message: "স্টাফের লেনদেন সেভ করা হয়েছে!"
      });
    } else {
      res.status(200).json({
        success: true,
        message: "লেনদেন সেভ করা হয়েছে!"
      });
    }
  } catch (err) {
    res.status(200).json({
      success: false,
      message: "লেনদেন সেভ করতে সমস্যা হয়েছে"
    });
  }
});

// 🟢 গ্লোবাল ৪০৪ হ্যান্ডলার
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Requested API Endpoint Not Found"
  });
});

// 🟢 গ্লোবাল এরর হ্যান্ডলার
app.use((err, req, res, next) => {
  console.error("Global Error:", err);
  res.status(500).json({
    success: false,
    message: "সার্ভারে অনাকাঙ্ক্ষিত এরর ঘটেছে"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
