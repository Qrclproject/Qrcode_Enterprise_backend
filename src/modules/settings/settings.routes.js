const express = require('express');
const router = express.Router();
const ctrl = require('./settings.controller');
const auth = require('../../middleware/auth');

router.get('/', auth, ctrl.getSettings);
router.put('/', auth, ctrl.updateSettings);

module.exports = router;