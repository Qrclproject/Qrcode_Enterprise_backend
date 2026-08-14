const express = require('express');
const router = express.Router();
const ctrl = require('./media.controller');
const auth = require('../../middleware/auth');

router.get('/', auth, ctrl.list);
router.post('/delete', auth, ctrl.remove);

module.exports = router;