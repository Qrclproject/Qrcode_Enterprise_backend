const express = require('express');
const router = express.Router();
const ctrl = require('./template.controller');
const validate = require('../../middleware/validate');
const { createTemplateSchema, updateTemplateSchema } = require('./template.validation');
const auth = require('../../middleware/auth');

router.post('/', auth, validate(createTemplateSchema), ctrl.create);
router.get('/', auth, ctrl.getAll);
router.get('/:id', auth, ctrl.getById);
router.put('/:id', auth, validate(updateTemplateSchema), ctrl.update);
router.delete('/:id', auth, ctrl.remove);
router.post('/:id/clone', auth, ctrl.clone);

module.exports = router;