// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');

let activeFaultsList = []; // বর্তমান নেটওয়ার্ক ফল্ট স্টোর

// 🟢 সমস্যা সনাক্তকরণ লজিক (ONU vs Fiber Cut vs Router Down)
async function runNetworkDiagnostics() {
  try {
    if (!admin || !admin.apps.length) return;
    const db = admin.firestore();

    const snapshot = await db.collection('customers').get();
    if (snapshot.empty) return;

    const currentCustomers = [];
    const areaDisconnectedMap = {};

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

    // 🟢 ফল্ট ক্লাসিফিকেশন লজিক
    for (const cust of newlyDisconnected) {
      const area = cust.area || 'Main Area';
      const countInArea = areaDisconnectedMap[area] || 1;

      let faultCategory = 'ONU_OFF'; // অনূ বন্ধ বা পাওয়ার কাট
      let faultTitle = 'কাস্টমার অনূ (ONU) বন্ধ বা বিদ্যুৎ নেই';
      let severity = 'LOW';

      // একই এলাকায় ৩ বা তার বেশি ডিসকানেক্ট ➔ ফাইবার ক্যাবল কাটা
      if (countInArea >= 3 && countInArea < 20) {
        faultCategory = 'FIBER_CUT';
        faultTitle = `${area} এলাকায় ফাইবার ক্যাবল কাটা বা স্প্লিটার সমস্যা`;
        severity = 'HIGH';
      } 
      // প্রায় সবাই অফলাইন ➔ মেইন রাউটার ডাউন
      else if (totalOfflineCount > 50 && totalActiveCount < 10) {
        faultCategory = 'ROUTER_DOWN';
        faultTitle = 'প্রধান মাইক্রোটিক রাউটার বা মেইন ইন্টারফেস বন্ধ';
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
    }

    activeFaultsList = newFaults;
    return activeFaultsList;

  } catch (err) {
    console.error("Diagnostics Error:", err.message);
    return [];
  }
}

// 🔔 ফায়ারবেস পুশ নোটিফিকেশন সেন্ডার (FCM)
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
