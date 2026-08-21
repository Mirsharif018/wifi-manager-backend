// File Path: services/fault_detector.service.js
const admin = require('firebase-admin');
const net = require('net');
const crypto = require('crypto');

let activeFaultsList = [];
const lastAlertTimeMap = new Map();
let previousOnlineSet = null;

// 🟢 মাইক্রোটিক রাউটার থেকে সরাসরি লাইভ অন-লাইন পিপিইওই কাস্টমার রিড করার ফাংশন
function fetchMikrotikActiveUsers(host, port, username, password) {
  return new Promise((resolve) => {
    if (!host || !username) return resolve(null);

    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let onlineUsers = [];
    let state = 'LOGIN';

    socket.setTimeout(5000);

    function encodeLength(len) {
      if (len < 0x80) return Buffer.from([len]);
      if (len < 0x4000) return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
      return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
    }

    function sendSentence(words) {
      for (let word of words) {
        const b = Buffer.from(word, 'utf8');
        socket.write(encodeLength(b.length));
        socket.write(b);
      }
      socket.write(Buffer.from([0]));
    }

    socket.connect(parseInt(port) || 38728, host, () => {
      sendSentence(['/login']);
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const str = buffer.toString('utf8');

      if (state === 'LOGIN' && str.includes('=ret=')) {
        const match = str.match(/=ret=([a-fA-F0-9]+)/);
        if (match) {
          const chal = match[1];
          const md5 = crypto.createHash('md5');
          md5.update(Buffer.concat([Buffer.from([0]), Buffer.from(password, 'utf8'), Buffer.from(chal, 'hex')]));
          const responseHash = md5.digest('hex');

          state = 'ACTIVE_PRINT';
          buffer = Buffer.alloc(0);
          sendSentence(['/login', `=name=${username}`, `=response=00${responseHash}`]);
        }
      } else if (state === 'ACTIVE_PRINT' && (str.includes('!done') || str.includes('!trap'))) {
        state = 'GET_USERS';
        buffer = Buffer.alloc(0);
        sendSentence(['/ppp/active/print']);
      } else if (state === 'GET_USERS') {
        const matches = str.match(/=name=([^\=\!]+)/g);
        if (matches) {
          matches.forEach(m => {
            const u = m.replace('=name=', '').trim();
            if (u && !onlineUsers.includes(u)) onlineUsers.push(u);
          });
        }
        if (str.includes('!done')) {
          socket.destroy();
          resolve(onlineUsers);
        }
      }
    });

    socket.on('error', () => { socket.destroy(); resolve(null); });
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

async function runNetworkDiagnostics() {
  try {
    if (!admin || !admin.apps.length) return [];
    const db = admin.firestore();

    // ১. ফায়ারবেস থেকে রাউটার ক্রেডেনশিয়াল লোড
    const settingsSnap = await db.collection('settings').doc('app_config').get();
    let routerIp = "", routerPort = "38728", routerUser = "", routerPass = "";
    if (settingsSnap.exists) {
      const s = settingsSnap.data();
      routerIp = s.router_ip || "";
      routerPort = s.router_port || "38728";
      routerUser = s.router_username || "";
      routerPass = s.router_password || "";
    }

    // ২. ফায়ারবেস থেকে কাস্টমার ডাটা লোড
    const snapshot = await db.collection('customers').get();
    if (snapshot.empty) return [];

    const allCustomersMap = new Map();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const pppoe = (data.pppoe_name || data.name || '').trim();
      if (pppoe) allCustomersMap.set(pppoe, data);
    });

    // ৩. রাউটার থেকে সরাসরি লাইভ অন-লাইন কাস্টমারদের লিস্ট ফেচ
    let liveOnlineUsers = await fetchMikrotikActiveUsers(routerIp, routerPort, routerUser, routerPass);

    const currentOnlineSet = new Set();

    if (liveOnlineUsers && Array.isArray(liveOnlineUsers)) {
      liveOnlineUsers.forEach(u => currentOnlineSet.add(u));
    } else {
      allCustomersMap.forEach((cust, pppoe) => {
        if ((cust.status === 'অ্যাক্টিভ' || cust.status === 'active') && cust.is_online !== false) {
          currentOnlineSet.add(pppoe);
        }
      });
    }

    const totalCustomersCount = allCustomersMap.size;
    const totalOnlineCount = currentOnlineSet.size;
    const totalOfflineCount = Math.max(0, totalCustomersCount - totalOnlineCount);

    // 🟢 বেসলাইন সেটআপ (১ম স্ক্যানে কোনো ফেক মেসেজ যাবে না)
    if (previousOnlineSet === null) {
      previousOnlineSet = currentOnlineSet;
      console.log(`Live Baseline Set: Online ${totalOnlineCount}, Offline ${totalOfflineCount}`);
      return [];
    }

    // ৪. কারেন্ট যাওয়ার পর নতুন অফলাইন হওয়া কাস্টমার বের করা
    const newlyDisconnectedPppoe = [];
    const areaDisconnectedMap = {};

    previousOnlineSet.forEach(pppoe => {
      if (!currentOnlineSet.has(pppoe)) {
        newlyDisconnectedPppoe.push(pppoe);
        const cust = allCustomersMap.get(pppoe);
        const area = (cust && cust.area) ? cust.area : 'Main Area';
        areaDisconnectedMap[area] = (areaDisconnectedMap[area] || 0) + 1;
      }
    });

    previousOnlineSet = currentOnlineSet;

    if (newlyDisconnectedPppoe.length === 0) {
      return activeFaultsList;
    }

    const newFaults = [];
    const nowTime = Date.now();

    // 🟢 লোডশেডিং ও ডিসকানেক্ট অ্যালার্ট নোটিফিকেশন তৈরি
    for (const pppoe of newlyDisconnectedPppoe) {
      const cust = allCustomersMap.get(pppoe) || { pppoe_name: pppoe, name: pppoe, refer_id: pppoe, area: 'Main Area' };
      const area = cust.area || 'Main Area';
      const countInArea = areaDisconnectedMap[area] || 1;

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

      // 🔔 ৫ মিনিটের কুলডাউন ফিল্টার ও লাইভ অন/অফলাইন সংখ্যা সহ পুশ মেসেজ
      const lastAlertTime = lastAlertTimeMap.get(area) || 0;
      if (nowTime - lastAlertTime > 5 * 60 * 1000) {
        lastAlertTimeMap.set(area, nowTime);

        if (countInArea >= 3) {
          sendPushAlert(
            `⚡ লোডশেডিং অ্যালার্ট (${area} এলাকা)`,
            `বিদ্যুৎ যাওয়ার কারণে ${area} এলাকায় ${countInArea} জন অফলাইন হয়েছে। (বর্তমানে অনলাইনে: ${totalOnlineCount} জন, অফলাইনে: ${totalOfflineCount} জন)`,
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
