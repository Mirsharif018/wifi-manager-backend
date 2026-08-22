// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');

let activeFaultsList = [];

// ⚡ ১. মাইক্রোটিক থেকে সরাসরি কাস্টমার অফলাইন ওয়েবহুক প্রসেসর (১ সেকেন্ডে ইনস্ট্যান্ট নোটিফিকেশন)
async function handleUserDisconnectedEvent(pppoeName) {
  try {
    if (!admin || !admin.apps.length || !pppoeName) return;
    const db = admin.firestore();

    const snapshot = await db.collection('customers').where('pppoe_name', '==', pppoeName).get();
    let custData = { name: pppoeName, refer_id: pppoeName, area: 'Main Area', phone: '' };

    if (!snapshot.empty) {
      custData = snapshot.docs[0].data();
    }

    // শুধুমাত্র 'অ্যাক্টিভ' (বিল দেওয়া) কাস্টমার হলে নোটিফিকেশন পাঠানো হবে
    const statusText = (custData.status || '').toString().trim();
    if (statusText === 'অ্যাক্টিভ' || statusText === 'active') {
      await sendPushAlert(
        `🔌 কাস্টমার অনূ (ONU) বন্ধ`,
        `${custData.name || pppoeName} (REF: ${custData.refer_id || pppoeName}) এর অনূ বন্ধ বা পাওয়ার নেই!`,
        { refer_id: custData.refer_id || pppoeName, pppoe_name: pppoeName, type: 'ONU_OFF' }
      );
    }
  } catch (err) {
    console.error("User Down Event Error:", err.message);
  }
}

// ⚡ ২. মাইক্রোটিক থেকে সরাসরি কাস্টমার অনলাইন ওয়েবহুক প্রসেসর (১ সেকেন্ডে ইনস্ট্যান্ট নোটিফিকেশন)
async function handleUserConnectedEvent(pppoeName) {
  try {
    if (!admin || !admin.apps.length || !pppoeName) return;
    const db = admin.firestore();

    const snapshot = await db.collection('customers').where('pppoe_name', '==', pppoeName).get();
    let custData = { name: pppoeName, refer_id: pppoeName };

    if (!snapshot.empty) {
      custData = snapshot.docs[0].data();
    }

    const statusText = (custData.status || '').toString().trim();
    if (statusText === 'অ্যাক্টিভ' || statusText === 'active') {
      await sendPushAlert(
        `🟢 কাস্টমার অনলাইন অ্যালার্ট`,
        `${custData.name || pppoeName} (REF: ${custData.refer_id || pppoeName}) এর অনূ চালু হয়েছে এবং অনলাইনে যুক্ত হয়েছেন!`,
        { refer_id: custData.refer_id || pppoeName, pppoe_name: pppoeName, type: 'CUSTOMER_ONLINE' }
      );
    }
  } catch (err) {
    console.error("User Up Event Error:", err.message);
  }
}

async function runNetworkDiagnostics() {
  return activeFaultsList;
}

// 🔔 ৩. ফায়ারবেস হাই-প্রাইওরিটি পুশ অ্যালার্ট পাঠানোর মেথড (Android High Priority)
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
