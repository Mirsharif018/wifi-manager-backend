// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');

let activeFaultsList = [];
const lastAlertTimeMap = new Map(); // এরিয়া অনুযায়ী নোটিফিকেশন কুলডাউন সময়

async function runNetworkDiagnostics() {
  try {
    if (!admin || !admin.apps.length) return [];
    const db = admin.firestore();

    const snapshot = await db.collection('customers').get();
    if (snapshot.empty) return [];

    const currentCustomers = [];
    const areaDisconnectedMap = {}; // এলাকা অনুযায়ী অফলাইন কাস্টমার সংখ্যা

    snapshot.docs.forEach(doc => {
      currentCustomers.push(doc.data());
    });

    let totalActiveCount = 0;
    let totalOfflineCount = 0;
    const newlyDisconnected = [];

    currentCustomers.forEach(cust => {
      const isOnline = cust.status === 'অ্যাক্টিভ';

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

    // 🟢 স্মার্ট লোডশেডিং ও ফাইবার ফল্ট ক্লাসিফিকেশন
    for (const cust of newlyDisconnected) {
      const area = cust.area || 'Main Area';
      const countInArea = areaDisconnectedMap[area] || 1;

      let faultCategory = 'ONU_OFF'; 
      let faultTitle = 'কাস্টমার অনূ (ONU) বন্ধ বা বিদ্যুৎ নেই';
      let severity = 'LOW';

      // ৩ জনের বেশি একসাথে বন্ধ হলে ➔ লোডশেডিং / ফাইবার প্রবলেম
      if (countInArea >= 3 && countInArea < 20) {
        faultCategory = 'FIBER_CUT';
        faultTitle = `⚡ ${area} এলাকায় লোডশেডিং / ফাইবার স্প্লিটার বন্ধ (${countInArea} জন অফলাইন)`;
        severity = 'HIGH';
      } 
      // বড় ধরনের পাওয়ার কাট বা মেইন পপ ডাউন
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

      // 🔔 নোটিফিকেশন স্প্যাম প্রতিরোধ (৫ মিনিটের কুলডাউন ফিল্টার)
      const lastAlertTime = lastAlertTimeMap.get(area) || 0;
      if (nowTime - lastAlertTime > 5 * 60 * 1000) { // ৫ মিনিট সময় বিরতি
        lastAlertTimeMap.set(area, nowTime);

        if (countInArea >= 3) {
          sendPushAlert(
            `⚡ লোডশেডিং অ্যালার্ট (${area})`,
            `${area} এলাকায় লোডশেডিংয়ের কারণে ${countInArea} জন কাস্টমার অফলাইন হয়েছে।`,
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

// 🔔 ফায়ারবেস পুশ নোটিফিকেশন সেন্ডার
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
