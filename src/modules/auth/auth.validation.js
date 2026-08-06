const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password is required'),
  }),
});

// ─── Agent schemas ──────────────────────────────────────────────
const createAgentSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    permissions: z.array(z.string()).optional(),
  }),
});

const updateAgentSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }),
});

module.exports = { registerSchema, loginSchema, createAgentSchema, updateAgentSchema };