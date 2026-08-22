// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');
const { Client, Databases, Query } = require('node-appwrite');

// 🟢 Appwrite ক্লাউড কানেকশন
const appwriteClient = new Client()
  .setEndpoint('https://sgp.cloud.appwrite.io/v1')
  .setProject('6a89602c00197fa35c90')
  .setKey('standard_27f0e26fb885717dfb5151d6cbb27bfa5cb1219215bbd80db3d5915b1ec8be9cdab54478a5e8ba25a742ee0659df7b0a159c052b3f0d5e1de6c9f2c154334832ffed1df1c627e3f605b75ee1c63b5bbd787eeac4bb692121616f550fb834968e8a3d20ea51fd774fbd2fbbcdb918a150954d092aed840ef9663d3a84f4fa0682');

const databases = new Databases(appwriteClient);
const APPWRITE_DB_ID = '6a89615d002147df646d';
const APPWRITE_CUST_COLLECTION = 'customers';

let activeFaultsList = [];

// 🟢 রিয়েল-টাইম ফাইবার ক্যাবল কাটা ধরার জন্য ৬০ সেকেন্ডের টাইম-উইন্ডো মেমোরি
const recentDisconnectLogs = []; 
const lastAreaFiberAlertTimeMap = new Map();

// ⚡ ১. মাইক্রোটিক সরাসরি অনূ বন্ধ / ফাইবার কাটা প্রসেসর
async function handleUserDisconnectedEvent(pppoeName) {
  try {
    if (!pppoeName) return;
    
    let custName = pppoeName;
    let referId = pppoeName;
    let areaName = 'Main Area';

    try {
      const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [
        Query.limit(1000)
      ]);
      
      const searchTarget = pppoeName.trim().toLowerCase();
      const matched = docs.documents.find(d => {
        const pName = (d.pppoe_name || '').toString().trim().toLowerCase();
        const uName = (d.name || '').toString().trim().toLowerCase();
        return pName === searchTarget || uName === searchTarget;
      });

      if (matched) {
        custName = matched.name || pppoeName;
        referId = matched.refer_id || pppoeName;
        areaName = matched.area || 'Main Area';
      }
    } catch (e) {
      console.log("Appwrite lookup fallback:", e.message);
    }

    const now = Date.now();
    recentDisconnectLogs.push({ pppoe: pppoeName, area: areaName, time: now });

    // ৬০ সেকেন্ডের আগের পুরোনো রেকর্ড সারভার মেমোরি থেকে ক্লিয়ার করা
    const windowStartTime = now - 60 * 1000;
    for (let i = recentDisconnectLogs.length - 1; i >= 0; i--) {
      if (recentDisconnectLogs[i].time < windowStartTime) {
        recentDisconnectLogs.splice(i, 1);
      }
    }

    // ওই একই এরিয়ায় গত ৬০ সেকেন্ডে কতজন ডিসকানেক্ট হয়েছে তার হিসাব
    const areaDisconnectCount = recentDisconnectLogs.filter(item => item.area === areaName).length;
    const lastFiberAlertTime = lastAreaFiberAlertTimeMap.get(areaName) || 0;

    // 🚨 যদি একই এলাকায় ৬০ সেকেন্ডের মধ্যে ৩ বা তার বেশি কাস্টমার অফলাইন হয় ➔ ফাইবার ক্যাবল কাটা
    if (areaDisconnectCount >= 3) {
      if (now - lastFiberAlertTime > 3 * 60 * 1000) { // ৩ মিনিট স্প্যাম ফিল্টার
        lastAreaFiberAlertTimeMap.set(areaName, now);

        sendPushAlert(
          `🚨 ফাইবার তার কাটা পড়ার সংকেত (${areaName} এলাকা)`,
          `${areaName} এলাকায় মূল ফাইবার তার কাটা পড়ার কারণে ${areaDisconnectCount} জন কাস্টমার একসাথে অফলাইন হয়েছেন!`,
          { area: areaName, count: areaDisconnectCount.toString(), type: 'FIBER_CUT' }
        );
      }
    } else {
      // 🔌 কেবল ১-২ জন ডিসকানেক্ট হলে ➔ সাধারণ অনূ বন্ধ নোটিফিকেশন
      sendPushAlert(
        `🔌 কাস্টমার অনূ (ONU) বন্ধ`,
        `${custName} (REF: ${referId}) এর অনূ বন্ধ বা পাওয়ার নেই!`,
        { refer_id: referId, pppoe_name: pppoeName, type: 'ONU_OFF' }
      );
    }

  } catch (err) {
    console.error("User Down Event Error:", err.message);
  }
}

// ⚡ ২. মাইক্রোটিক সরাসরি অনূ চালু নোটিফিকেশন প্রসেসর
async function handleUserConnectedEvent(pppoeName) {
  try {
    if (!pppoeName) return;

    let custName = pppoeName;
    let referId = pppoeName;

    try {
      const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [
        Query.limit(1000)
      ]);
      
      const searchTarget = pppoeName.trim().toLowerCase();
      const matched = docs.documents.find(d => {
        const pName = (d.pppoe_name || '').toString().trim().toLowerCase();
        const uName = (d.name || '').toString().trim().toLowerCase();
        return pName === searchTarget || uName === searchTarget;
      });

      if (matched) {
        custName = matched.name || pppoeName;
        referId = matched.refer_id || pppoeName;
      }
    } catch (e) {
      console.log("Appwrite lookup fallback:", e.message);
    }

    await sendPushAlert(
      `🟢 কাস্টমার অনলাইন অ্যালার্ট`,
      `${custName} (REF: ${referId}) এর অনূ চালু হয়েছে এবং অনলাইনে যুক্ত হয়েছেন!`,
      { refer_id: referId, pppoe_name: pppoeName, type: 'CUSTOMER_ONLINE' }
    );

  } catch (err) {
    console.error("User Up Event Error:", err.message);
  }
}

async function runNetworkDiagnostics() {
  return activeFaultsList;
}

// 🔔 ফায়ারবেস হাই-প্রাইওরিটি পুশ অ্যালার্ট সেন্ডার
async function sendPushAlert(title, body, dataPayload = {}) {
  try {
    if (!admin || !admin.apps.length) return;
    
    const message = {
      topic: 'owner_network_alerts',
      notification: { title, body },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_importance_channel',
          priority: 'max'
        }
      },
      data: dataPayload
    };

    await admin.messaging().send(message);
    console.log("FCM Direct Webhook Push Alert Sent Successfully!");
  } catch (err) {
    console.log("FCM Send Safe Catch:", err.message);
  }
}

module.exports = {
  runNetworkDiagnostics,
  handleUserDisconnectedEvent,
  handleUserConnectedEvent,
  sendPushAlert,
  getActiveFaults: () => activeFaultsList
};
