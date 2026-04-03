const WORD_LIST_A = [
  'amber',
  'blue',
  'coral',
  'dawn',
  'echo',
  'frost',
  'golden',
  'haze',
  'indigo',
  'jade',
  'kite',
  'lemon',
  'mist',
  'nova',
  'ocean',
  'pine',
  'quartz',
  'rose',
  'sage',
  'teal',
  'ultra',
  'violet',
  'wave',
  'xenon',
  'yellow',
  'zephyr',
];

const WORD_LIST_B = [
  'bird',
  'cloud',
  'drop',
  'ember',
  'field',
  'grove',
  'hill',
  'isle',
  'jewel',
  'knoll',
  'lake',
  'moon',
  'night',
  'orbit',
  'peak',
  'quest',
  'river',
  'storm',
  'tide',
  'union',
  'vale',
  'wind',
  'xenial',
  'yard',
  'zone',
];

interface DomainSettings {
  emailDomain?: string;
  mailgunSandboxEmail?: string;
  mailgunDomain?: string;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@+/, '');
}

export function resolveAssignedEmailDomain(settings?: DomainSettings): string {
  return (
    settings?.emailDomain ||
    settings?.mailgunSandboxEmail ||
    settings?.mailgunDomain ||
    process.env.MAILGUN_SANDBOX_EMAIL ||
    'sandbox.postino.pro'
  );
}

export function getEmailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return '';
  return normalizeDomain(parts[1]);
}

export function isEmailUsingDomain(email: string, domain: string): boolean {
  const emailDomain = getEmailDomain(email);
  const normalizedDomain = normalizeDomain(domain);
  if (!emailDomain || !normalizedDomain) return false;
  return emailDomain === normalizedDomain;
}

export function generateAssignedEmail(domain = 'sandbox.postino.pro'): string {
  const wordA = WORD_LIST_A[Math.floor(Math.random() * WORD_LIST_A.length)];
  const wordB = WORD_LIST_B[Math.floor(Math.random() * WORD_LIST_B.length)];
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${wordA}-${wordB}-${digits}@${domain}`;
}
