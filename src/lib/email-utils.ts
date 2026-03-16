const WORD_LIST_A = [
  'amber', 'blue', 'coral', 'dawn', 'echo', 'frost', 'golden', 'haze',
  'indigo', 'jade', 'kite', 'lemon', 'mist', 'nova', 'ocean', 'pine',
  'quartz', 'rose', 'sage', 'teal', 'ultra', 'violet', 'wave', 'xenon',
  'yellow', 'zephyr',
];

const WORD_LIST_B = [
  'bird', 'cloud', 'drop', 'ember', 'field', 'grove', 'hill', 'isle',
  'jewel', 'knoll', 'lake', 'moon', 'night', 'orbit', 'peak', 'quest',
  'river', 'storm', 'tide', 'union', 'vale', 'wind', 'xenial', 'yard', 'zone',
];

interface DomainSettings {
  emailDomain?: string;
  mailgunSandboxEmail?: string;
  mailgunDomain?: string;
}

export function resolveAssignedEmailDomain(settings?: DomainSettings): string {
  return (
    settings?.emailDomain ||
    settings?.mailgunSandboxEmail ||
    settings?.mailgunDomain ||
    process.env.MAILGUN_SANDBOX_EMAIL ||
    'sandbox.postino.app'
  );
}

export function generateAssignedEmail(domain = 'sandbox.postino.app'): string {
  const wordA = WORD_LIST_A[Math.floor(Math.random() * WORD_LIST_A.length)];
  const wordB = WORD_LIST_B[Math.floor(Math.random() * WORD_LIST_B.length)];
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${wordA}-${wordB}-${digits}@${domain}`;
}
