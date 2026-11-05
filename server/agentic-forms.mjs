/**
 * Field definitions for the four Agentic AI options. The server validates every submission against these
 * specs and the browser renders its forms from the same specs (served by GET /api/public/agentic/catalog),
 * so labels, limits and required flags can never drift apart.
 *
 *   READY_MADE      priced checkout   (pick a pre-built solution)
 *   CUSTOMIZED      quotation request (custom-built agent)
 *   BRANDED         quotation request (branded agent)
 *   CHAT_ONLY       priced checkout   (conversational agent)
 */

export class FormError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.status = 400;
    this.fields = fields;
  }
}

const TIMELINES = ['As soon as possible', 'Within 1 month', '1 to 3 months', '3 to 6 months', 'Flexible'];
const DEPLOYMENTS = ['Unified Cloud (managed)', 'My own domain on Unified Cloud', 'My own server or on-premise', 'Not sure yet'];
const TONES = ['Professional', 'Friendly', 'Concise', 'Formal', 'Playful'];
const KNOWLEDGE = ['No knowledge base', 'Documents I will upload or paste', 'My website content', 'Documents and website'];

export const FORM_SPECS = Object.freeze({
  READY_MADE: {
    title: 'Ready-Made AI options',
    fields: [
      { key: 'useCase', label: 'How will you use this agent?', type: 'textarea', max: 1000, help: 'A short note helps us prepare your deployment.' },
      { key: 'notes', label: 'Anything else we should know?', type: 'textarea', max: 2000 }
    ]
  },

  CUSTOMIZED: {
    title: 'Customized Agentic AI requirements',
    sections: [
      { title: 'Your business', fields: [
        { key: 'businessName', label: 'Business name', type: 'text', required: true, max: 160 },
        { key: 'industry', label: 'Industry', type: 'text', max: 120 },
        { key: 'businessDescription', label: 'Describe your business', type: 'textarea', required: true, max: 3000, help: 'What you do, who your customers are and how you work today.' }
      ] },
      { title: 'Objectives and capabilities', fields: [
        { key: 'objectives', label: 'Project objectives', type: 'textarea', required: true, max: 3000, help: 'What should this agent achieve for your business?' },
        { key: 'aiCapabilities', label: 'Expected AI capabilities', type: 'textarea', required: true, max: 3000, help: 'For example: answer questions, plan tasks, use tools, take actions, hand off to people.' },
        { key: 'automationRequirements', label: 'Automation requirements', type: 'textarea', max: 3000 }
      ] },
      { title: 'Technical details', fields: [
        { key: 'integrations', label: 'Required integrations', type: 'textarea', max: 2000, help: 'Systems the agent must connect to (CRM, ERP, email, databases, APIs).' },
        { key: 'preferredTechnologies', label: 'Preferred technologies', type: 'textarea', max: 2000 },
        { key: 'expectedVolume', label: 'Expected users or request volume', type: 'text', max: 200 }
      ] },
      { title: 'Project details', fields: [
        { key: 'timeline', label: 'Preferred timeline', type: 'select', options: TIMELINES },
        { key: 'budgetRange', label: 'Budget range (optional)', type: 'text', max: 120 },
        { key: 'additionalDetails', label: 'Additional project details', type: 'textarea', max: 4000 }
      ] }
    ]
  },

  BRANDED: {
    title: 'Branded Agentic AI requirements',
    sections: [
      { title: 'Brand identity', fields: [
        { key: 'brandName', label: 'Business / brand name', type: 'text', required: true, max: 160 },
        { key: 'tagline', label: 'Tagline (optional)', type: 'text', max: 200 },
        { key: 'brandColors', label: 'Brand colors', type: 'colors', max: 200, help: 'Hex values separated by commas, for example #0a2540, #5cf0ff.' },
        { key: 'brandIdentity', label: 'Brand identity and voice', type: 'textarea', max: 3000, help: 'Values, tone and how your brand should come across.' }
      ] },
      { title: 'Agent appearance and deployment', fields: [
        { key: 'chatAppearance', label: 'Custom chatbot appearance', type: 'textarea', max: 3000, help: 'Avatar, greeting, window style, button position.' },
        { key: 'deploymentPreference', label: 'Deployment preference', type: 'select', options: DEPLOYMENTS },
        { key: 'domain', label: 'Domain (optional)', type: 'domain', max: 253, help: 'For example agent.yourcompany.com' }
      ] },
      { title: 'Capabilities and requirements', fields: [
        { key: 'requiredCapabilities', label: 'Required AI capabilities', type: 'textarea', required: true, max: 3000 },
        { key: 'integrations', label: 'Integrations', type: 'textarea', max: 2000 },
        { key: 'additionalRequirements', label: 'Additional business requirements', type: 'textarea', max: 4000 }
      ] }
    ],
    files: {
      logo: { label: 'Logo', multiple: false, mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 1024 * 1024 },
      brandAssets: { label: 'Other brand assets (up to 3)', multiple: true, maxFiles: 3, mimes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], maxBytes: 2 * 1024 * 1024 }
    }
  },

  CHAT_ONLY: {
    title: 'Chat-Only AI configuration',
    sections: [
      { title: 'Chatbot purpose', fields: [
        { key: 'purpose', label: 'What should the chatbot do?', type: 'textarea', required: true, max: 2000, help: 'For example answer product questions, qualify leads, support customers.' },
        { key: 'knowledgeBase', label: 'Knowledge-base requirements', type: 'select', options: KNOWLEDGE },
        { key: 'websiteUrl', label: 'Website to integrate with', type: 'url', max: 300, help: 'https://www.example.com' }
      ] },
      { title: 'Conversation', fields: [
        { key: 'languages', label: 'Supported languages', type: 'text', required: true, max: 200, help: 'For example English, Bengali.' },
        { key: 'tone', label: 'Conversation style', type: 'select', options: TONES },
        { key: 'customResponses', label: 'Custom responses and behavior', type: 'textarea', max: 3000 }
      ] },
      { title: 'Look and deployment', fields: [
        { key: 'brandingPreferences', label: 'Branding preferences', type: 'textarea', max: 2000 },
        { key: 'deploymentRequirements', label: 'Deployment requirements', type: 'textarea', max: 2000 },
        { key: 'additionalSpecs', label: 'Additional specifications', type: 'textarea', max: 3000 }
      ] }
    ]
  }
});

export const CONTACT_FIELDS = Object.freeze([
  { key: 'name', label: 'Full name', type: 'text', required: true, max: 120 },
  { key: 'email', label: 'Email', type: 'email', required: true, max: 254 },
  { key: 'phone', label: 'Phone', type: 'text', max: 30 },
  { key: 'company', label: 'Company', type: 'text', max: 120 }
]);

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function allFields(spec) {
  return spec.sections ? spec.sections.flatMap(s => s.fields) : spec.fields;
}

function cleanText(v, max) {
  return String(v ?? '').replace(CTRL, '').trim().slice(0, max);
}

/**
 * Validates `input` (an object of field values) against a category spec. Returns the cleaned values;
 * throws FormError with a per-field message map when anything is wrong. Unknown keys are dropped.
 */
export function validateForm(category, input = {}) {
  const spec = FORM_SPECS[category];
  if (!spec) throw new FormError('Unknown configuration category.');
  const out = {};
  const errors = {};
  for (const f of allFields(spec)) {
    const raw = input[f.key];
    const tooLong = typeof raw === 'string' && raw.length > f.max * 2;
    let v = tooLong ? '' : cleanText(raw, f.max || 500);
    if (tooLong) errors[f.key] = `${f.label} is too long.`;
    if (!v) {
      if (f.required && !errors[f.key]) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if (f.type === 'select' && !f.options.includes(v)) errors[f.key] = `${f.label}: choose one of the listed options.`;
    else if (f.type === 'email' && !EMAIL_RE.test(v)) errors[f.key] = `${f.label} must be a valid email address.`;
    else if (f.type === 'domain' && !DOMAIN_RE.test(v)) errors[f.key] = `${f.label} must be a valid domain name.`;
    else if (f.type === 'url') {
      try {
        const u = new URL(v);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error('scheme');
      } catch {
        errors[f.key] = `${f.label} must be a valid http(s) address.`;
      }
    } else if (f.type === 'colors') {
      const parts = v.split(/[,\s]+/).filter(Boolean);
      if (!parts.length || parts.length > 8 || !parts.every(p => COLOR_RE.test(p))) errors[f.key] = `${f.label}: use hex values such as #0a2540, separated by commas.`;
      else v = parts.map(p => p.toLowerCase()).join(', ');
    }
    out[f.key] = v;
  }
  if (Object.keys(errors).length) throw new FormError('Please correct the highlighted fields.', errors);
  return out;
}

export function validateContact(input = {}) {
  const errors = {};
  const out = {};
  for (const f of CONTACT_FIELDS) {
    const v = cleanText(input[f.key], f.max);
    if (!v) { if (f.required) errors[f.key] = `${f.label} is required.`; continue; }
    if (f.type === 'email') {
      const e = v.toLowerCase();
      if (!EMAIL_RE.test(e)) errors[f.key] = 'Enter a valid email address.';
      out[f.key] = e;
    } else {
      if (f.key === 'name' && v.length < 2) errors[f.key] = 'Enter your full name.';
      out[f.key] = v;
    }
  }
  if (Object.keys(errors).length) throw new FormError('Please correct the highlighted fields.', { contact: errors });
  return out;
}

/** Validates uploaded files for a category (magic bytes, size, count). Returns rows ready to store. */
export function validateFiles(category, files) {
  const spec = FORM_SPECS[category]?.files;
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return [];
  if (!spec) throw new FormError('This option does not accept file uploads.');
  const out = [];
  const counts = {};
  for (const f of list) {
    const rule = spec[f?.kind];
    if (!rule) throw new FormError(`Unknown file type "${f?.kind}".`);
    counts[f.kind] = (counts[f.kind] || 0) + 1;
    if (!rule.multiple && counts[f.kind] > 1) throw new FormError(`Only one ${rule.label.toLowerCase()} file is allowed.`);
    if (rule.multiple && counts[f.kind] > rule.maxFiles) throw new FormError(`At most ${rule.maxFiles} files for "${rule.label}".`);
    if (!rule.mimes.includes(f.mime)) throw new FormError(`${rule.label}: unsupported file type ${f.mime || ''}.`);
    const buf = Buffer.from(String(f.dataBase64 || ''), 'base64');
    if (!buf.length) throw new FormError(`${rule.label}: the file is empty.`);
    if (buf.length > rule.maxBytes) throw new FormError(`${rule.label}: file is larger than ${rule.maxBytes / 1024 / 1024} MB.`);
    const magic = {
      'image/png': buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      'image/jpeg': buf[0] === 0xff && buf[1] === 0xd8,
      'image/webp': buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP',
      'application/pdf': buf.subarray(0, 5).toString('latin1') === '%PDF-'
    }[f.mime];
    if (!magic) throw new FormError(`${rule.label}: file content does not match its type.`);
    out.push({
      kind: f.kind,
      filename: cleanText(String(f.name || 'file').replace(/[\\/]/g, '_'), 120) || 'file',
      mime: f.mime,
      size: buf.length,
      b64: buf.toString('base64')
    });
  }
  return out;
}
