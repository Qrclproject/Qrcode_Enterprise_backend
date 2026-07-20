const asyncHandler = require('../../utils/asyncHandler');
const templateService = require('./template.service');
const Template = require('./template.model');          // ← missing import
const ApiError = require('../../utils/apiError');      // ← missing import

const create = asyncHandler(async (req, res) => {
  const template = await templateService.create(req.body);
  res.status(201).json({ success: true, data: template });
});

const getAll = asyncHandler(async (req, res) => {
  const templates = await templateService.getAll();
  res.json({ success: true, data: templates });
});

const getById = asyncHandler(async (req, res) => {
  const template = await templateService.getById(req.params.id);
  res.json({ success: true, data: template });
});

const update = asyncHandler(async (req, res) => {
  const template = await templateService.update(req.params.id, req.body);
  res.json({ success: true, data: template });
});

const remove = asyncHandler(async (req, res) => {
  await templateService.remove(req.params.id);
  res.json({ success: true, message: 'Template deleted' });
});

const clone = asyncHandler(async (req, res) => {
  const newTemplate = await templateService.cloneTemplate(req.params.id);
  res.status(201).json({ success: true, data: newTemplate });
});

// POST /api/templates/bulk-delete
const bulkDelete = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, 'No template IDs provided');
  }
  await Template.deleteMany({ _id: { $in: ids } });
  res.json({ success: true, message: `${ids.length} templates deleted` });
});

// DELETE /api/templates/:templateId/variants/:variantIndex
const deleteVariant = asyncHandler(async (req, res) => {
  const { templateId, variantIndex } = req.params;
  const template = await Template.findById(templateId);
  if (!template) throw new ApiError(404, 'Template not found');

  const idx = parseInt(variantIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= template.variants.length) {
    throw new ApiError(400, 'Invalid variant index');
  }

  template.variants.splice(idx, 1);
  await template.save();

  res.json({ success: true, data: template });
});

module.exports = {
  create,
  getAll,
  getById,
  update,
  remove,
  clone,
  bulkDelete,       // ← added
  deleteVariant,    // ← added
};