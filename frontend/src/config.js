export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Keystone';
export const DOCS_URL = import.meta.env.VITE_DOCS_URL || '#';
export const KEY_PREFIX = import.meta.env.VITE_KEY_PREFIX || 'ks_live_';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? 'true') === 'true';

/**
 * Models your platform exposes. Prices are USD per 1M tokens.
 * The backend is the source of truth for billing; these are used for labels
 * and for the mock backend. Your API can override them via GET /models later.
 */
export const MODELS = [
  { id: 'nova-pro', label: 'Nova Pro', input: 1.25, output: 5.0, color: 'var(--c1)' },
  { id: 'nova-flash', label: 'Nova Flash', input: 0.15, output: 0.6, color: 'var(--c2)' },
  { id: 'nova-embed', label: 'Nova Embed', input: 0.02, output: 0, color: 'var(--c3)' },
];

export const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label || id;

/** Usage tiers and their per-model limits (requests/min, tokens/min, requests/day). */
export const TIERS = {
  free: {
    label: 'Free',
    requirement: 'Default for new projects. No billing account.',
    limits: {
      'nova-pro': { rpm: 5, tpm: 250_000, rpd: 100 },
      'nova-flash': { rpm: 15, tpm: 1_000_000, rpd: 1_500 },
      'nova-embed': { rpm: 100, tpm: 1_000_000, rpd: 10_000 },
    },
  },
  tier1: {
    label: 'Tier 1',
    requirement: 'Billing account linked to the project.',
    limits: {
      'nova-pro': { rpm: 150, tpm: 2_000_000, rpd: 10_000 },
      'nova-flash': { rpm: 1_000, tpm: 4_000_000, rpd: 50_000 },
      'nova-embed': { rpm: 3_000, tpm: 10_000_000, rpd: null },
    },
  },
  tier2: {
    label: 'Tier 2',
    requirement: '$250 total spend and 30 days since first payment.',
    limits: {
      'nova-pro': { rpm: 1_000, tpm: 5_000_000, rpd: 50_000 },
      'nova-flash': { rpm: 2_000, tpm: 10_000_000, rpd: 100_000 },
      'nova-embed': { rpm: 5_000, tpm: 20_000_000, rpd: null },
    },
  },
  tier3: {
    label: 'Tier 3',
    requirement: '$1,000 total spend and 30 days since first payment.',
    limits: {
      'nova-pro': { rpm: 2_000, tpm: 8_000_000, rpd: null },
      'nova-flash': { rpm: 10_000, tpm: 30_000_000, rpd: null },
      'nova-embed': { rpm: 10_000, tpm: 50_000_000, rpd: null },
    },
  },
};

export const TIER_ORDER = ['free', 'tier1', 'tier2', 'tier3'];
