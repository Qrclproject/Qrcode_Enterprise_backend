const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('./design.controller');
const auth = require('../../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', auth, upload.single('image'), ctrl.createDesign);
router.get('/', auth, ctrl.getDesigns);
router.get('/:designId', auth, ctrl.getDesign);
router.put('/:designId', auth, upload.single('image'), ctrl.updateDesign);
router.delete('/:designId', auth, ctrl.deleteDesign);

module.exports = router;