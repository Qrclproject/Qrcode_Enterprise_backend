const asyncHandler = require('../../utils/asyncHandler');
const templateService = require('./template.service');

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

module.exports = { create, getAll, getById, update, remove, clone };