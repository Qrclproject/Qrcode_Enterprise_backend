const Template = require('./template.model');
const ApiError = require('../../utils/apiError');

const create = async (data) => {
  const template = await Template.create(data);
  return template;
};

const getAll = async () => {
  return Template.find().sort({ createdAt: -1 });
};

const getById = async (id) => {
  const template = await Template.findById(id);
  if (!template) throw new ApiError(404, 'Template not found');
  return template;
};

const update = async (id, data) => {
  const template = await Template.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!template) throw new ApiError(404, 'Template not found');
  return template;
};

const remove = async (id) => {
  const template = await Template.findByIdAndDelete(id);
  if (!template) throw new ApiError(404, 'Template not found');
  return template;
};

const cloneTemplate = async (id) => {
  const original = await getById(id);
  const newTemplate = await Template.create({
    name: original.name + ' (Copy)',
    whatsappTemplateName: original.whatsappTemplateName,
    category: original.category,
    showQR: original.showQR,
    variants: original.variants.map((v) => ({ label: v.label, body: v.body, active: v.active })),
    // ─── Copy CTA fields ────────────────────────────────────
    buttonType: original.buttonType,
    buttonText: original.buttonText,
    buttonValue: original.buttonValue,
  });
  return newTemplate;
};

module.exports = { create, getAll, getById, update, remove, cloneTemplate };