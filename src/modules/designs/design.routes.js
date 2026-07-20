const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const ctrl = require('./design.controller');
const auth = require('../../middleware/auth');

// POST – create a design (no Zod validation middleware)
router.post('/', auth, upload.single('image'), ctrl.create);

// GET – list user designs
router.get('/', auth, ctrl.getAll);

module.exports = router;