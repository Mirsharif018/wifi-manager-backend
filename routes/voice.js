// routes/voice.js (অথবা index.js এর ভেতর)
const express = require('express');
const router = express.Router();
const axios = require('axios'); // অথবা fetch ব্যবহার করতে পারেন

router.post('/send-voice', async (req, res) => {
  try {
    const { phone, message, token } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone and message are required' });
    }

    // আপনার ভয়েস গেটওয়ে প্রোভাইডারের API (যেমন: Greenweb Voice API)
    const apiUrl = 'https://api.greenweb.com.bd/api.php'; // আপনার প্রোভাইডারের সঠিক URL দিন
    const apiToken = token || process.env.VOICE_API_TOKEN; // ফায়ারবেস বা এনভায়রনমেন্ট থেকে টোকেন

    const response = await axios.post(apiUrl, {
      token: apiToken,
      to: phone,
      voice_text: message,
      language: 'bn-BD'
    });

    return res.status(200).json({
      success: true,
      message: 'Voice call triggered successfully',
      data: response.data
    });

  } catch (error) {
    console.error('Voice API Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to send voice call',
      error: error.message
    });
  }
});

module.exports = router;
