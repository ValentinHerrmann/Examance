/** Operator identity for Impressum and Datenschutzerklärung. Set per Cloudflare Pages environment (docs/deployment.md), never committed. */
export interface LegalOperator {
  name: string;
  street: string;
  postcodeCity: string;
  email: string;
  /** Optional: shown only when set. */
  phone: string;
}

export const legalOperator: LegalOperator = {
  name: (import.meta.env.VITE_LEGAL_NAME ?? '').trim(),
  street: (import.meta.env.VITE_LEGAL_STREET ?? '').trim(),
  postcodeCity: (import.meta.env.VITE_LEGAL_POSTCODE_CITY ?? '').trim(),
  email: (import.meta.env.VITE_LEGAL_EMAIL ?? '').trim(),
  phone: (import.meta.env.VITE_LEGAL_PHONE ?? '').trim(),
};

/** False when a required value is missing: the pages then show marked placeholders and a "not configured" banner. */
export const legalOperatorConfigured: boolean = Boolean(
  legalOperator.name && legalOperator.street && legalOperator.postcodeCity && legalOperator.email
);
