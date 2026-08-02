const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const ctrl = require('./design.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { createDesignSchema, updateDesignSchema } = require('./design.validation');

// POST – create with image upload
router.post('/', auth, upload.single('image'), validate(createDesignSchema), ctrl.create);

// GET – list designs
router.get('/', auth, ctrl.getAll);

// PUT – update design (name, qrPosition, qrPadding)
router.put('/:designId', auth, validate(updateDesignSchema), ctrl.updateDesign);

// DELETE – delete design
router.delete('/:designId', auth, ctrl.deleteDesign);

module.exports = router;