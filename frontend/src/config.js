export const APP_NAME = 'motion-captcha';

export const DOCS_URL = import.meta.env.VITE_DOCS_URL || '/integration';

/** Base URL customers' browsers use for /v1 (shown in snippets). */
export const PUBLIC_API_URL = (import.meta.env.VITE_PUBLIC_API_URL || window.location.origin).replace(/\/$/, '');

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  billing: 'Billing',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS = {
  admin: 'Everything, including team and billing',
  developer: 'Keys, analytics and logs',
  billing: 'Plans, invoices and quota alerts',
  viewer: 'Read-only',
};

export const ENDPOINT_LABELS = {
  assess: 'Assess',
  challenge: 'Challenge',
  verify: 'Verify',
};

export const ERROR_CODE_HELP = {
  'incorrect-answer': 'The user typed the wrong characters.',
  'token-already-used': 'The token was already verified once. Tokens are single-use.',
  'token-expired': 'The user answered after the challenge expired.',
  'invalid-token': 'The token is unknown or belongs to a different key.',
  'challenge-not-issued': 'The image was never loaded for this token.',
  origin_not_allowed: 'The request came from a domain that is not on the key’s allowlist.',
  rate_limited: 'The key exceeded its per-minute limit.',
  quota_exceeded: 'The monthly verification quota was reached.',
  key_revoked: 'The key has been revoked.',
  too_many_refreshes: 'The user asked for a new image too many times.',
  token_expired: 'The challenge image was requested after expiry.',
  token_used: 'The image was requested after the token was verified.',
  model_error: 'The risk model failed. Check the server logs.',
  generation_failed: 'Rendering the image failed. Check the server logs.',
};
