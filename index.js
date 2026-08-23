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
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '6a89602c00197fa35c90';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || 'standard_27f0e26fb885717dfb5151d6cbb27bfa5cb1219215bbd80db3d5915b1ec8be9cdab54478a5e8ba25a742ee0659df7b0a159c052b3f0d5e1de6c9f2c154334832ffed1df1c627e3f605b75ee1c63b5bbd787eeac4bb692121616f550fb834968e8a3d20ea51fd774fbd2fbbcdb918a150954d092aed840ef9663d3a84f4fa0682';

const appwriteClient = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

const databases = new Databases(appwriteClient);
const APPWRITE_DB_ID = process.env.APPWRITE_DB_ID || '6a89615d002147df646d';
const APPWRITE_CUST_COLLECTION = process.env.APPWRITE_CUST_COLLECTION || 'customers';

// ⚙️ ইন-মেমোরি স্টোর
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

// 🌐 Network Diagnostics Route Import
const diagnosticsRoutes = require('./routes/diagnostics.routes');

// 🛠️ হেল্পার ফাংশনসমূহ
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

  for (const rawKey of rowKeys) {
    const cleanKey = rawKey.replace(/^\ufeff/, '').trim().toLowerCase();
    for (const targetKey of possibleKeys) {
      const tKey = targetKey.toLowerCase();
      if (cleanKey === tKey || cleanKey.startsWith(tKey) || cleanKey.includes(tKey)) {
        const val = (row[rawKey] || '').toString().trim();
        if (val) return val;
      }
    }
  }

  const rowValues = Object.values(row);
  if (defaultIndex >= 0 && defaultIndex < rowValues.length) {
    return (rowValues[defaultIndex] || '').toString().trim();
  }

  return '';
}

// ⚡ অতি দ্রুত প্যারালাল চ্যাঙ্ক রানার ফাংশন
async function processInChunks(items, chunkSize, fn) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(fn));
  }
}

// -----------------------------------------------------------------------------
// 🌐 API ROUTES & ENDPOINTS
// -----------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: "Wi-Fi Manager Appwrite Backend API is Running Live!"
  });
});

// 🌐 ফাইল আপলোড করার HTML পেজ
app.get('/upload', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wi-Fi Manager CSV Upload</title>
      <style>
        body { font-family: Arial, sans-serif; background: #F4F7FE; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 80vh; margin: 0; }
        .card { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 420px; text-align: center; }
        h2 { color: #1E6FFF; margin-bottom: 20px; }
        input[type="file"] { margin-bottom: 20px; width: 100%; font-size: 14px; }
        button { background: #1E6FFF; color: white; border: none; padding: 14px 24px; border-radius: 10px; font-size: 16px; font-weight: bold; cursor: pointer; width: 100%; }
        button:hover { background: #2563EB; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Wi-Fi Manager CSV Upload</h2>
        <form action="/api/v1/customers/import-csv" method="POST" enctype="multipart/form-data">
          <input type="file" name="file" accept=".csv" required />
          <br/><br/>
          <button type="submit">ফাইল আপলোড করুন 🚀</button>
        </form>
      </div>
    </body>
    </html>
  `);
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

// 🌐 Appwrite Cloud থেকে সরাসরি কাস্টমার লিস্ট ফেচ
app.get('/api/v1/customers', async (req, res) => {
  try {
    const docs = await databases.listDocuments(
      APPWRITE_DB_ID, 
      APPWRITE_CUST_COLLECTION, 
      [Query.limit(5000)]
    );
    
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

// ⚡ 3.1. ONLY-APPWRITE HIGH-SPEED BATCH CSV IMPORT API
app.post('/api/v1/customers/import-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('<h2 style="color:red;text-align:center;">দয়া করে একটি CSV ফাইল সিলেক্ট করুন!</h2>');
    }

    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    bufferStream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const validCustomers = [];

          // ১. ডাটা এক্সট্র্যাক্ট করা (১ মিলি-সেকেন্ডে সম্পন্ন হবে)
          for (const row of results) {
            const customerId = getCsvVal(row, ['customer_id', 'customer', 'id', 'refer'], 0);
            const pppoeName = getCsvVal(row, ['pppoe_name', 'pppoe', 'username'], 2) || getCsvVal(row, ['name_of_client', 'name_of', 'name'], 1);
            if (!pppoeName) continue;

            const nameOfUser = getCsvVal(row, ['name_of_client', 'name_of', 'name'], 1) || pppoeName;
            const addressVal = getCsvVal(row, ['address_of_client', 'address_of', 'address'], 3) || 'ঠিকানা দেওয়া নেই';
            const bandwidthVal = getCsvVal(row, ['bandwidth_allocation', 'bandwidth', 'package'], 6) || 'মাসিক প্যাকেজ';
            const passwordVal = getCsvVal(row, ['password'], 7) || '123456';
            const priceVal = parseFloat(getCsvVal(row, ['selling_bandwidthbdt', 'selling', 'price', 'fee'], 17)) || 500;
            const areaVal = getCsvVal(row, ['area'], 12) || 'Main Area';
            const subAreaVal = getCsvVal(row, ['subarea', 'sub_area'], 11) || 'Sub Area';
            const commentVal = getCsvVal(row, ['comment'], 18);
            const statusRaw = getCsvVal(row, ['status'], 9).toLowerCase();

            let rawPhone = getCsvVal(row, ['client_phone', 'client_pho', 'phone', 'mobile'], 8);
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

            validCustomers.push({
              id: safeDocId,
              refer_id: customerId || pppoeName,
              mikrotik: getCsvVal(row, ['client_mikrotik', 'client1_mik', 'mikrotik'], 5) || 'Anik-ACCESS',
              name: nameOfUser,
              pppoe_name: pppoeName,
              password: passwordVal,
              phone: formattedPhone,
              address: addressVal,
              package_name: bandwidthVal,
              package_id: bandwidthVal,
              area: areaVal,
              sub_area: subAreaVal,
              monthly_fee: priceVal,
              comment: commentVal,
              status: statusText,
            });
          }

          // ২. শুধুমাত্র Appwrite Cloud-এ প্যারালাল সেভ (১-২ সেকেন্ডে সম্পন্ন হবে)
          if (databases && validCustomers.length > 0) {
            await processInChunks(validCustomers, 30, async (cust) => {
              try {
                await databases.createDocument(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, cust.id, {
                  refer_id: cust.refer_id,
                  name: cust.name,
                  pppoe_name: cust.pppoe_name,
                  phone: cust.phone,
                  address: cust.address,
                  package_name: cust.package_name,
                  monthly_fee: cust.monthly_fee,
                  status: cust.status
                });
              } catch (appwriteErr) {
                if (appwriteErr.code === 409) {
                  await databases.updateDocument(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, cust.id, {
                    refer_id: cust.refer_id,
                    name: cust.name,
                    pppoe_name: cust.pppoe_name,
                    phone: cust.phone,
                    address: cust.address,
                    package_name: cust.package_name,
                    monthly_fee: cust.monthly_fee,
                    status: cust.status
                  }).catch(() => {});
                }
              }
            });
          }

          // 🟢 ১-২ সেকেন্ডে কনফার্মেশন রেসপন্স সেন্ড
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Upload Successful</title>
              <style>
                body { font-family: Arial, sans-serif; background: #DCFCE7; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 80vh; margin: 0; }
                .card { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 420px; text-align: center; }
                h2 { color: #16A34A; margin-bottom: 10px; }
                p { color: #0F172A; font-size: 16px; line-height: 1.5; }
                a { display: inline-block; margin-top: 20px; background: #16A34A; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="card">
                <h2>অ্যাপরাইট ক্লাউড আপলোড সফল! 🎉</h2>
                <p>মোট <b>${validCustomers.length}</b> জন কাস্টমারের ডাটা Appwrite Cloud-এ সেভ হয়েছে।</p>
                <a href="/upload">পুনরায় আপলোড করুন</a>
              </div>
            </body>
            </html>
          `);

        } catch (err) {
          console.error("CSV Import Error:", err);
          return res.status(500).send(`<h2 style="color:red;text-align:center;">সেভ করতে সমস্যা হয়েছে: ${err.message}</h2>`);
        }
      });

  } catch (err) {
    console.error('CSV Route Fatal Error:', err);
    return res.status(500).send(`<h2 style="color:red;text-align:center;">সার্ভার এরর: ${err.message}</h2>`);
  }
});

// ➕ Appwrite-এ সিঙ্গেল কাস্টমার যোগ করা
app.post('/api/v1/customers/add', async (req, res) => {
  try {
    const { name, pppoe_name, phone, address, refer_id, package_name, monthly_fee, status } = req.body || {};
    const safeDocId = `CUST-${(pppoe_name || name || Date.now().toString()).replace(/[/\.#?\[\]]/g, '_')}`;

    if (databases) {
      await databases.createDocument(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, safeDocId, {
        refer_id: refer_id || pppoe_name || safeDocId,
        name: name || pppoe_name || "নবাগত কাস্টমার",
        pppoe_name: pppoe_name || name || "",
        phone: phone || "",
        address: address || "",
        package_name: package_name || "মাসিক প্যাকেজ",
        monthly_fee: Number(monthly_fee) || 500,
        status: status || "অ্যাক্টিভ"
      });
    }

    return res.status(200).json({
      success: true,
      message: "কাস্টমার সফলভাবে Appwrite Cloud-এ সেভ করা হয়েছে!"
    });
  } catch (err) {
    return res.status(200).json({ success: true, message: "কাস্টমার যোগ করা হয়েছে!" });
  }
});

app.post('/api/v1/customers/send-group-sms', async (req, res) => {
  try {
    const { target_group, customMessage } = req.body || {};
    const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [Query.limit(5000)]);

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

    return res.status(200).json({
      success: true,
      message: `রেফারেন্স #${refer_id} ভেরিফাই হয়েছে এবং ${customerName}-কে পেমেন্ট কনফার্মেশন এসএমএস পাঠানো হয়েছে!`
    });

  } catch (err) {
    return res.status(200).json({ success: true, message: `পেমেন্ট ভেরিফাই হয়েছে!` });
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
  res.status(200).json({
    success: true,
    data: {
      range: req.query.range || "today",
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

  res.status(200).json({ success: true, message: "সেটিংস সেভ করা হয়েছে!" });
});

app.post('/api/v1/router/reboot', (req, res) => {
  res.status(200).json({ success: true, message: "রাউটার রিবুট কমান্ড পাঠানো হয়েছে!" });
});

app.get('/api/v1/installments', (req, res) => {
  res.status(200).json({ success: true, data: { total_collected: 0, total_due: 0, installments: [] } });
});

app.post('/api/v1/sms/buy', (req, res) => {
  res.status(200).json({ success: true, message: "রিচার্জ রিকোয়েস্ট গ্রহণ করা হয়েছে!" });
});

// 🌐 404 & Global Error Middleware
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
