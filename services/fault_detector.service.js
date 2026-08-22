// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');
const { Client, Databases, Query } = require('node-appwrite');

const appwriteClient = new Client()
  .setEndpoint('https://sgp.cloud.appwrite.io/v1')
  .setProject('6a89602c00197fa35c90')
  .setKey('standard_27f0e26fb885717dfb5151d6cbb27bfa5cb1219215bbd80db3d5915b1ec8be9cdab54478a5e8ba25a742ee0659df7b0a159c052b3f0d5e1de6c9f2c154334832ffed1df1c627e3f605b75ee1c63b5bbd787eeac4bb692121616f550fb834968e8a3d20ea51fd774fbd2fbbcdb918a150954d092aed840ef9663d3a84f4fa0682');

const databases = new Databases(appwriteClient);
const APPWRITE_DB_ID = '6a89615d002147df646d';
const APPWRITE_CUST_COLLECTION = 'customers';

let activeFaultsList = [];

async function handleUserDisconnectedEvent(pppoeName) {
  try {
    if (!pppoeName) return;
    
    let custData = { name: pppoeName, refer_id: pppoeName, area: 'Main Area', phone: '' };

    try {
      const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [
        Query.equal('pppoe_name', pppoeName)
      ]);
      if (docs.total > 0) {
        custData = docs.documents[0];
      }
    } catch (_) {}

    const statusText = (custData.status || '').toString().trim();
    if (statusText === 'অ্যাক্টিভ' || statusText === 'active') {
      sendPushAlert(
        `🔌 কাস্টমার অনূ (ONU) বন্ধ`,
        `${custData.name || pppoeName} (REF: ${custData.refer_id || pppoeName}) এর অনূ বন্ধ বা পাওয়ার নেই!`,
        { refer_id: custData.refer_id || pppoeName, pppoe_name: pppoeName, type: 'ONU_OFF' }
      );
    }
  } catch (err) {
    console.error("User Down Event Error:", err.message);
  }
}

async function handleUserConnectedEvent(pppoeName) {
  try {
    if (!pppoeName) return;

    let custData = { name: pppoeName, refer_id: pppoeName };

    try {
      const docs = await databases.listDocuments(APPWRITE_DB_ID, APPWRITE_CUST_COLLECTION, [
        Query.equal('pppoe_name', pppoeName)
      ]);
      if (docs.total > 0) {
        custData = docs.documents[0];
      }
    } catch (_) {}

    const statusText = (custData.status || '').toString().trim();
    if (statusText === 'অ্যাক্টিভ' || statusText === 'active') {
      sendPushAlert(
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
