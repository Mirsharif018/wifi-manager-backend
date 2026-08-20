// File Path: routes/diagnostics.routes.js
const express = require('express');
const router = express.Router();
const faultDetector = require('../services/fault_detector.service');

// 🟢 ১. নেটওয়ার্ক ডায়াগনস্টিকস সামারি এপিআই
router.get('/summary', async (req, res) => {
  try {
    const faults = await faultDetector.runNetworkDiagnostics();

    const onuFaults = faults.filter(f => f.fault_category === 'ONU_OFF').length;
    const fiberFaults = faults.filter(f => f.fault_category === 'FIBER_CUT').length;
    const routerFaults = faults.filter(f => f.fault_category === 'ROUTER_DOWN').length;

    return res.json({
      success: true,
      data: {
        total_faults: faults.length,
        onu_issues: onuFaults,
        fiber_cuts: fiberFaults,
        router_issues: routerFaults,
        faults_list: faults
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 🟢 ২. ম্যানুয়াল নেটওয়ার্ক স্ক্যান এপিআই
router.post('/check-now', async (req, res) => {
  try {
    const faults = await faultDetector.runNetworkDiagnostics();
    
    return res.json({
      success: true,
      message: "নেটওয়ার্ক ডায়াগনস্টিক স্ক্যান সফল হয়েছে!",
      data: {
        total_faults: faults.length,
        faults_list: faults
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
