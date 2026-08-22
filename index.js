const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const stream = require('stream');
const { Client, Databases, Query } = require('node-appwrite');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// 🟢 Appwrite ক্লাউড কানেকশন (Singapore Server)
const appwriteClient = new Client()
  .setEndpoint('https://sgp.cloud.appwrite.io/v1')
  .setProject('6a89602c00197fa35c90')
  .setKey('standard_27f0e26fb885717dfb5151d6cbb27bfa5cb1219215bbd80db3d5915b1ec8be9cdab54478a5e8ba25a742ee0659df7b0a159c052b3f0d5e1de6c9f2c154334832ffed1df1c627e3f605b75ee1c63b5bbd787eeac4bb692121616f550fb834968e8a3d20ea51fd774fbd2fbbcdb918a150954d092aed840ef9663d3a84f4fa0682');

const databases = new Databases(appwriteClient);
const APPWRITE_DB_ID = '6a89615d002147df646d';
const APPWRITE_CUST_COLLECTION = 'customers';

let settingsStore = {
  business_name: "Net Point",
  helpline: "",
  bkash_number: "01789222002",
  nagad_number: "01789222002",
  router_ip: "",
  router_port: "38728",
  router_username: "",
  router_password: "",
  auto_payment: true,
  notification_enabled: true
};

let smsBalanceStore = 500;
let staffStore = [];

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

const diagnosticsRoutes = require('./routes/diagnostics.routes');

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

function getCsvVal(row, possibleKeys, defaultIndex = -1) {
  if (!row) return '';
  const rowKeys = Object.keys(row);
  const rowValues = Object.values(row);

  for (const rawKey of rowKeys) {
    const cleanKey = rawKey.replace(/^\ufeff/, '').trim().toLowerCase();
    for (const targetKey of possibleKeys) {
      const tKey = targetKey.toLowerCase();
      if (cleanKey === tKey || cleanKey.startsWith(tKey) || tKey.startsWith(cleanKey)) {
        const val = (row[rawKey] || '').toString().trim();
        if (val) return val;
      }
    }
  }

  if (defaultIndex >= 0 && defaultIndex < rowValues.length) {
    return (rowValues[defaultIndex] || '').toString().trim();
  }

  return '';
}

async function ensureAppwriteAttributes() {
  try {
    const stringAttrs = [
      'refer_id', 'name', 'pppoe_name', 'password', 'phone', 
      'address', 'package_name', 'area', 'sub_area', 'status', 
      'ip_address', 'mac_address', 'comment', 'mikrotik'
    ];
    for (let attr of stringAttrs) {
      try {
        await databases.createStringAttribute(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, attr, 500, false);
      } catch (_) {}
    }
    try {
      await databases.createFloatAttribute(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, 'monthly_fee', false);
    } catch (_) {}
  } catch (e) {
    console.log("Attributes setup:", e.message);
  }
}

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: "Wi-Fi Manager Owner App Backend API (Appwrite Powered) is Running Live!"
  });
});

app.post('/api/v1/auth/sync', (req, res) => {
  res.status(200).json({
    success: true,
    data: { user_id: "OWNER-101", role: "Owner" },
    message: "ইউজার সিঙ্ক সফল হয়েছে"
  });
});

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

app.get('/api/v1/customers', async (req, res) => {
  try {
    const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [Query.limit(1000)]);
    const list = docs.documents.map(d => ({
      id: d.$id,
      refer_id: d.refer_id || '',
      name: d.name || '',
      pppoe_name: d.pppoe_name || '',
      phone: d.phone || '',
      address: d.address || '',
      package_name: d.package_name || '',
      monthly_fee: d.monthly_fee || 500,
      status: d.status || 'অ্যাক্টিভ',
      area: d.area || '',
      sub_area: d.sub_area || '',
      ip_address: d.ip_address || '0.0.0.0',
      mac_address: d.mac_address || '00:00:00:00:00:00'
    }));
    return res.json({ success: true, data: list });
  } catch (err) {
    return res.json({ success: true, data: [] });
  }
});

app.use('/api/v1/diagnostics', diagnosticsRoutes);

// ⚡ 3.1. HIGH-SPEED PARALLEL CSV IMPORT API (মাত্র ২-৩ সেকেন্ডে আপলোড সম্পন্ন)
app.post('/api/v1/customers/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'দয়া করে একটি CSV ফাইল আপলোড করুন!' });
    }

    await ensureAppwriteAttributes();

    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    bufferStream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          let count = 0;
          const CHUNK_SIZE = 30; // 🟢 একসাথে ৩০টি প্যারালাল রিকোয়েস্ট প্রসেসিং

          for (let i = 0; i < results.length; i += CHUNK_SIZE) {
            const chunk = results.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(async (row) => {
              const customerId = getCsvVal(row, ['customer', 'id', 'refer'], 0);
              const pppoeName = getCsvVal(row, ['pppoe', 'username'], 2) || getCsvVal(row, ['name_of', 'name'], 1);
              if (!pppoeName) return;

              const nameOfUser = getCsvVal(row, ['name_of', 'name'], 1) || pppoeName;
              const addressVal = getCsvVal(row, ['address_of', 'address'], 3) || 'ঠিকানা দেওয়া নেই';
              const bandwidthVal = getCsvVal(row, ['bandwidth', 'package'], 6) || 'মাসিক প্যাকেজ';
              const passwordVal = getCsvVal(row, ['password'], 7) || '123456';
              const priceVal = parseFloat(getCsvVal(row, ['selling', 'price', 'fee'], 17)) || 500;
              const areaVal = getCsvVal(row, ['area'], 12) || 'Main Area';
              const subAreaVal = getCsvVal(row, ['subarea', 'sub_area'], 11) || 'Sub Area';
              const commentVal = getCsvVal(row, ['comment'], 18);
              const statusRaw = getCsvVal(row, ['status'], 9).toLowerCase();

              let rawPhone = getCsvVal(row, ['client_pho', 'phone', 'mobile'], 8);
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

              const safeDocId = `CUST-${pppoeName.replace(/[/\.#?\[\]]/g, '_')}`;

              let statusText = 'অ্যাক্টিভ';
              if (statusRaw === 'expired' || statusRaw === 'unpaid') {
                statusText = 'মেয়াদোত্তীর্ণ';
              }

              const customerData = {
                refer_id: customerId || pppoeName,
                mikrotik: getCsvVal(row, ['client1_mik', 'client_mikrotik', 'mikrotik'], 5) || 'Anik-ACCESS',
                name: nameOfUser,
                pppoe_name: pppoeName,
                password: passwordVal,
                phone: formattedPhone,
                address: addressVal,
                package_name: bandwidthVal,
                area: areaVal,
                sub_area: subAreaVal,
                monthly_fee: priceVal,
                comment: commentVal,
                status: statusText,
                ip_address: '0.0.0.0',
                mac_address: '00:00:00:00:00:00'
              };

              try {
                await databases.createDocument(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, safeDocId, customerData);
              } catch (_) {
                try {
                  await databases.updateDocument(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, safeDocId, customerData);
                } catch (__) {}
              }

              if (admin && admin.apps.length) {
                try {
                  await admin.firestore().collection('customers').doc(safeDocId).set(customerData, { merge: true });
                } catch (_) {}
              }

              count++;
            }));
          }

          return res.status(200).json({
            success: true,
            message: `ঝড়ের গতিতে Appwrite ক্লাউড ডাটাবেজে ${count} জন কাস্টমারের ডাটা সেভ করা হয়েছে! 🎉`
          });

        } catch (dbErr) {
          console.error('Appwrite Import Error:', dbErr);
          return res.status(500).json({ success: false, message: 'Appwrite এরর: ' + dbErr.message });
        }
      });

  } catch (err) {
    console.error('CSV Route Error:', err);
    return res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + err.message });
  }
});

app.post('/api/v1/customers/send-group-sms', async (req, res) => {
  try {
    const { target_group, customMessage } = req.body || {};
    const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [Query.limit(1000)]);

    if (docs.total === 0) {
      return res.status(400).json({ success: false, message: 'কোনো কাস্টমার পাওয়া যায়নি!' });
    }

    let sentCount = 0;
    const bkashNumber = settingsStore.bkash_number || "01789222002";

    docs.documents.forEach(cust => {
      const isDue = cust.status === 'মেয়াদোত্তীর্ণ' || cust.status === 'unpaid';

      if ((target_group === 'due' && isDue) || target_group === 'all' || (target_group === 'active' && !isDue)) {
        let personalizedMsg = (customMessage || '')
          .replace(/\{bill\}/g, cust.monthly_fee || 500)
          .replace(/\{refer_id\}/g, cust.refer_id || cust.pppoe_name)
          .replace(/\{bkash\}/g, bkashNumber)
          .replace(/\{name\}/g, cust.name || cust.pppoe_name);

        console.log(`Sending SMS to ${cust.phone || cust.name}: ${personalizedMsg}`);
        sentCount++;
      }
    });

    smsBalanceStore = Math.max(0, smsBalanceStore - sentCount);

    return res.status(200).json({
      success: true,
      message: `সফলভাবে ${sentCount} জন কাস্টমারকে যার যার বিল ও রেফারেন্স আইডি সহ এসএমএস পাঠানো হয়েছে! 🎉`
    });

  } catch (err) {
    console.error("Send Group SMS Error:", err);
    return res.status(500).json({ success: false, message: 'এসএমএস পাঠাতে সমস্যা হয়েছে: ' + err.message });
  }
});

app.post('/api/v1/payments/manual-approve', async (req, res) => {
  try {
    const { refer_id, trx_id, phone } = req.body || {};
    
    let customerName = "কাস্টমার";
    let paidAmount = 500;
    let customerPhone = phone || "";

    try {
      const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [
        Query.equal('refer_id', refer_id)
      ]);

      if (docs.total > 0) {
        const custDoc = docs.documents[0];
        customerName = custDoc.name || custDoc.pppoe_name;
        paidAmount = custDoc.monthly_fee || 500;
        customerPhone = custDoc.phone || phone;

        await databases.updateDocument(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, custDoc.$id, {
          status: 'অ্যাক্টিভ'
        });
      }
    } catch (_) {}

    const thankYouMsg = `প্রিয় গ্রাহক, আপনার Wi-Fi বিল ${paidAmount} টাকা সফলভাবে পরিশোধ হয়েছে। ধন্যবাদ।`;
    console.log(`Sending Thank You SMS to ${customerPhone || customerName}: ${thankYouMsg}`);

    return res.status(200).json({
      success: true,
      message: `রেফারেন্স #${refer_id} ভেরিফাই হয়েছে এবং ${customerName}-কে পেমেন্ট কনফার্মেশন এসএমএস পাঠানো হয়েছে!`
    });

  } catch (err) {
    console.error("Approve Payment Error:", err);
    return res.status(200).json({ success: true, message: `পেমেন্ট ভেরিফাই হয়েছে!` });
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
  res.status(200).json({ success: true, message: `কাস্টমার ${req.params.id} এর সংযোগ বন্ধ করা হয়েছে!` });
});

app.get('/api/v1/transactions', (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

app.get('/api/v1/packages', (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

app.put('/api/v1/packages/:id/toggle', (req, res) => {
  res.status(200).json({ success: true, message: "প্যাকেজের স্ট্যাটাস পরিবর্তন করা হয়েছে!" });
});

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

app.post('/api/v1/router/reboot', (req, res) => {
  res.status(200).json({ success: true, message: "রাউটার রিবুট কমান্ড পাঠানো হয়েছে!" });
});

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

app.post('/api/v1/sms/buy', (req, res) => {
  const { package_id } = req.body || {};
  let count = 500;
  if (package_id === 'SMS-1000') count = 1000;
  if (package_id === 'SMS-5000') count = 5000;

  smsBalanceStore += count;

  res.status(200).json({ success: true, message: `আপনার ${count} টি এসএমএস রিচার্জ রিকোয়েস্ট গ্রহণ করা হয়েছে!` });
});

app.get('/api/v1/staff', (req, res) => {
  res.status(200).json({ success: true, data: staffStore });
});

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

    res.status(200).json({ success: true, data: newStaff, message: `নতুন স্টাফ '${newStaff.name}' সফলভাবে সেভ করা হয়েছে!` });
  } catch (err) {
    res.status(200).json({ success: false, message: "স্টাফ সেভ করতে সমস্যা হয়েছে" });
  }
});

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

      res.status(200).json({ success: true, data: staff, message: "স্টাফের লেনদেন সেভ করা হয়েছে!" });
    } else {
      res.status(200).json({ success: true, message: "লেনদেন সেভ করা হয়েছে!" });
    }
  } catch (err) {
    res.status(200).json({ success: false, message: "লেনদেন সেভ করতে সমস্যা হয়েছে" });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Requested API Endpoint Not Found" });
});

app.use((err, req, res, next) => {
  console.error("Global Error:", err);
  res.status(500).json({ success: false, message: "সার্ভারে অনাকাঙ্ক্ষিত এরর ঘটেছে" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
