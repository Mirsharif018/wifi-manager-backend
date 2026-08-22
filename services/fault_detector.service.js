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

// ⚡ ১. মাইক্রোটিক সরাসরি অনূ বন্ধ নোটিফিকেশন প্রসেসর (১০০% নিশ্চিত ইনস্ট্যান্ট পুশ সেন্ড)
async function handleUserDisconnectedEvent(pppoeName) {
  try {
    if (!pppoeName) return;
    
    let custName = pppoeName;
    let referId = pppoeName;

    // Appwrite ক্লাউড থেকে নিরাপদ কাস্টমার তথ্য খোঁজা
    try {
      const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [
        Query.limit(100)
      ]);
      const matched = docs.documents.find(d => 
        (d.pppoe_name || '').toLowerCase() === pppoeName.toLowerCase() ||
        (d.name || '').toLowerCase() === pppoeName.toLowerCase()
      );
      if (matched) {
        custName = matched.name || pppoeName;
        referId = matched.refer_id || pppoeName;
      }
    } catch (e) {
      console.log("Appwrite lookup fallback:", e.message);
    }

    // 🟢 কোনো শর্ত ছাড়াই সরাসরি ইনস্ট্যান্ট পুশ নোটিফিকেশন সেন্ড
    await sendPushAlert(
      `🔌 কাস্টমার অনূ (ONU) বন্ধ`,
      `${custName} (REF: ${referId}) এর অনূ বন্ধ বা পাওয়ার নেই!`,
      { refer_id: referId, pppoe_name: pppoeName, type: 'ONU_OFF' }
    );

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
        Query.limit(100)
      ]);
      const matched = docs.documents.find(d => 
        (d.pppoe_name || '').toLowerCase() === pppoeName.toLowerCase() ||
        (d.name || '').toLowerCase() === pppoeName.toLowerCase()
      );
      if (matched) {
        custName = matched.name || pppoeName;
        referId = matched.refer_id || pppoeName;
      }
    } catch (e) {
      console.log("Appwrite lookup fallback:", e.message);
    }

    // 🟢 নিশ্চিত নোটিফিকেশন সেন্ড
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
