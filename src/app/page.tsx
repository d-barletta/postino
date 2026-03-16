import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-50 via-white to-purple-50">
      <nav className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✉️</span>
            <span className="font-bold text-xl text-gray-900">Postino</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 rounded-full px-4 py-1.5 text-sm font-medium mb-8">
            <span>🤖</span> Powered by AI
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Your emails,{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-600 to-purple-600">
              intelligently
            </span>{' '}
            processed
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Get a private email address. Write simple rules in plain English. Postino&apos;s AI
            processes your incoming emails — summarizing newsletters, removing ads, extracting
            key info — then forwards the result to you.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="shadow-lg shadow-indigo-200">
                Start for free
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="secondary">
                How it works
              </Button>
            </Link>
          </div>
        </div>

        <section id="how-it-works" className="py-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '📬',
                step: '1',
                title: 'Get your address',
                desc: 'Sign up and get a unique Postino email address like amber-cloud-4829@postino.app',
              },
              {
                icon: '📝',
                step: '2',
                title: 'Write your rules',
                desc: 'Tell Postino what to do in plain English: "Summarize newsletters", "Remove promotional content", etc.',
              },
              {
                icon: '⚡',
                step: '3',
                title: 'Receive processed email',
                desc: 'Postino processes incoming emails with AI and forwards clean, useful content to your real inbox.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 text-3xl mb-4">
                  {item.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Example rules</h2>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              'Summarize newsletters and remove all ads and promotional content',
              'Extract and list only the important action items from emails',
              'Translate emails to English and summarize the main points',
              'For receipts and order confirmations, extract only the order details and total',
              'Remove tracking pixels and rewrite links to be clean',
              'If the email is a promotional offer, ignore it entirely',
            ].map((rule) => (
              <div
                key={rule}
                className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-4"
              >
                <span className="text-green-500 mt-0.5">✓</span>
                <p className="text-sm text-gray-700">{rule}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

    </div>
  );
}
