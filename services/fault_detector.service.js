// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');

let activeFaultsList = [];
const lastAlertTimeMap = new Map();

async function runNetworkDiagnostics() {
  try {
    if (!admin || !admin.apps.length) return [];
    const db = admin.firestore();

    const snapshot = await db.collection('customers').get();
    if (snapshot.empty) return [];

    const activePayingCustomers = [];
    const areaDisconnectedMap = {};

    // 🟢 সেফটি ফিল্টার: যাদের মেয়াদ শেষ ('মেয়াদোত্তীর্ণ'), তাদের মনিটরিং থেকে সম্পূর্ণ বাদ দেওয়া হলো
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const statusText = (data.status || '').toString().trim();
      
      // শুধুমাত্র 'অ্যাক্টিভ' (বিল দেওয়া) কাস্টমারদের ডাটাবেজ ফিল্টার
      if (statusText === 'অ্যাক্টিভ' || statusText === 'active') {
        activePayingCustomers.push(data);
      }
    });

    let totalActiveCount = 0;
    let totalOfflineCount = 0;
    const newlyDisconnected = [];

    activePayingCustomers.forEach(cust => {
      const isOnline = cust.is_online === true || cust.connection_state === 'online';

      if (isOnline) {
        totalActiveCount++;
      } else {
        totalOfflineCount++;
        const area = cust.area || 'Main Area';
        areaDisconnectedMap[area] = (areaDisconnectedMap[area] || 0) + 1;
        newlyDisconnected.push(cust);
      }
    });

    const newFaults = [];
    const nowTime = Date.now();

    for (const cust of newlyDisconnected) {
      const area = cust.area || 'Main Area';
      const countInArea = areaDisconnectedMap[area] || 1;

      let faultCategory = 'ONU_OFF'; 
      let faultTitle = 'কাস্টমার অনূ (ONU) বন্ধ বা বিদ্যুৎ নেই';
      let severity = 'LOW';

      if (countInArea >= 3 && countInArea < 20) {
        faultCategory = 'FIBER_CUT';
        faultTitle = `⚡ ${area} এলাকায় লোডশেডিং / ফাইবার স্প্লিটার বন্ধ (${countInArea} জন অফলাইন)`;
        severity = 'HIGH';
      } 
      else if (totalOfflineCount > 50 && totalActiveCount < 10) {
        faultCategory = 'ROUTER_DOWN';
        faultTitle = '🚨 প্রধান রাউটার বা মেইন পপ-এ লোডশেডিং / বিদ্যুৎ বন্ধ';
        severity = 'CRITICAL';
      }

      newFaults.push({
        id: `FLT-${cust.refer_id || cust.pppoe_name}`,
        customer_name: cust.name || cust.pppoe_name,
        pppoe_name: cust.pppoe_name,
        refer_id: cust.refer_id,
        phone: cust.phone,
        area: area,
        fault_category: faultCategory,
        title: faultTitle,
        severity: severity,
        time: new Date().toLocaleTimeString('bn-BD')
      });

      // 🔔 ৫ মিনিটের কুলডাউন ফিল্টার
      const lastAlertTime = lastAlertTimeMap.get(area) || 0;
      if (nowTime - lastAlertTime > 5 * 60 * 1000) {
        lastAlertTimeMap.set(area, nowTime);

        if (countInArea >= 3) {
          sendPushAlert(
            `⚡ লোডশেডিং / লাইন ডিসকানেক্ট (${area})`,
            `${area} এলাকায় সক্রিয় কাস্টমারদের মধ্যে ${countInArea} জনের সংযোগ বিচ্ছিন্ন হয়েছে।`,
            { area, count: countInArea.toString() }
          );
        }
      }
    }

    activeFaultsList = newFaults;
    return activeFaultsList;

  } catch (err) {
    console.error("Diagnostics Error:", err.message);
    return [];
  }
}

async function sendPushAlert(title, body, dataPayload = {}) {
  try {
    if (!admin || !admin.apps.length) return;
    
    const message = {
      topic: 'owner_network_alerts',
      notification: { title, body },
      data: dataPayload
    };

    await admin.messaging().send(message);
    console.log("FCM Push Alert Sent Successfully!");
  } catch (err) {
    console.log("FCM Send Safe Catch:", err.message);
  }
}

module.exports = {
  runNetworkDiagnostics,
  sendPushAlert,
  getActiveFaults: () => activeFaultsList
};
