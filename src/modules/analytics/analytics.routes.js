const express = require('express');
const router = express.Router();
const ctrl = require('./analytics.controller');
const auth = require('../../middleware/auth');

router.get('/dashboard', auth, ctrl.getDashboard);
router.get('/messages-over-time', auth, ctrl.getMessagesOverTime);
router.get('/template-usage', auth, ctrl.getTemplateUsage);

module.exports = router;