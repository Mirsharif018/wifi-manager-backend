// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');

let activeFaultsList = [];
const lastAlertTimeMap = new Map();
let previousOnlinePppoeSet = null; // আগের স্ক্যানের লাইভ অনলাইন সেট

async function runNetworkDiagnostics() {
  try {
    if (!admin || !admin.apps.length) return [];
    const db = admin.firestore();

    const snapshot = await db.collection('customers').get();
    if (snapshot.empty) return [];

    const allCustomersMap = new Map();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const pppoe = (data.pppoe_name || data.name || '').trim();
      if (pppoe) {
        allCustomersMap.set(pppoe, data);
      }
    });

    const currentOnlineSet = new Set();
    allCustomersMap.forEach((cust, pppoe) => {
      const statusText = (cust.status || '').toString().trim();
      if (statusText === 'অ্যাক্টিভ' || statusText === 'active') {
        if (cust.is_online !== false) {
          currentOnlineSet.add(pppoe);
        }
      }
    });

    // 🟢 ১ম স্ক্যানে শুধুমাত্র বেসলাইন সেট করা হবে, কোনো ফেক মেসেজ যাবে না!
    if (previousOnlinePppoeSet === null) {
      previousOnlinePppoeSet = currentOnlineSet;
      console.log(`Initial Baseline Set: ${currentOnlineSet.size} active customers.`);
      return [];
    }

    // 🟢 ২. শুধুমাত্র নতুন রিয়েল ডিসকানেক্টেড ইউজার বের করা (আগে অনলাইনে ছিল কিন্তু এখন নেই)
    const newlyDisconnectedPppoe = [];
    const areaDisconnectedCountMap = {};

    previousOnlinePppoeSet.forEach(pppoe => {
      if (!currentOnlineSet.has(pppoe)) {
        newlyDisconnectedPppoe.push(pppoe);
        const cust = allCustomersMap.get(pppoe);
        const area = (cust && cust.area) ? cust.area : 'Main Area';
        areaDisconnectedCountMap[area] = (areaDisconnectedCountMap[area] || 0) + 1;
      }
    });

    // পরবর্তী স্ক্যানের জন্য আপডেট
    previousOnlinePppoeSet = currentOnlineSet;

    // 🟢 ৩. সত্যি সত্যি কেউ অফলাইন না হলে কোনো মেসেজ যাবে না
    if (newlyDisconnectedPppoe.length === 0) {
      return activeFaultsList;
    }

    const newFaults = [];
    const nowTime = Date.now();

    for (const pppoe of newlyDisconnectedPppoe) {
      const cust = allCustomersMap.get(pppoe) || { pppoe_name: pppoe, name: pppoe, refer_id: pppoe, area: 'Main Area' };
      const area = cust.area || 'Main Area';
      const countInArea = areaDisconnectedCountMap[area] || 1;

      let faultCategory = 'ONU_OFF';
      let faultTitle = 'কাস্টমার অনূ (ONU) বন্ধ বা বিদ্যুৎ নেই';
      let severity = 'LOW';

      if (countInArea >= 3) {
        faultCategory = 'FIBER_CUT';
        faultTitle = `⚡ ${area} এলাকায় লোডশেডিং / ফাইবার স্প্লিটার বন্ধ (${countInArea} জন অফলাইন)`;
        severity = 'HIGH';
      }

      newFaults.push({
        id: `FLT-${cust.refer_id || pppoe}`,
        customer_name: cust.name || pppoe,
        pppoe_name: pppoe,
        refer_id: cust.refer_id || pppoe,
        phone: cust.phone || '',
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
            `⚡ লোডশেডিং / ফাইবার লাইন ডিসকানেক্ট (${area})`,
            `${area} এলাকায় সক্রিয় কাস্টমারদের মধ্যে ${countInArea} জনের সংযোগ বিচ্ছিন্ন হয়েছে।`,
            { area, count: countInArea.toString() }
          );
        } else if (countInArea === 1) {
          sendPushAlert(
            `🔌 কাস্টমার অনূ (ONU) বন্ধ`,
            `${cust.name || pppoe} (REF: ${cust.refer_id}) এর অনূ বন্ধ বা পাওয়ার নেই।`,
            { refer_id: cust.refer_id }
          );
        }
      }
    }

    activeFaultsList = newFaults;
    return activeFaultsList;

  } catch (err) {
    console.error("Diagnostics Error:", err.message);
    return activeFaultsList;
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
