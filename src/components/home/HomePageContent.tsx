'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { useI18n } from '@/lib/i18n';

export function HomePageContent() {
  const { t } = useI18n();
  const { hero, howItWorks, exampleRules } = t.home;

  const steps = [
    { icon: 'bi bi-inbox-fill', step: '1', ...howItWorks.step1 },
    { icon: 'bi bi-pencil', step: '2', ...howItWorks.step2 },
    { icon: 'bi bi-lightning-charge-fill', step: '3', ...howItWorks.step3 },
  ];

  return (
    <div className="min-h-full">
      <nav className="glass-panel sticky top-0 z-10 border-b border-white/40 dark:border-white/10 border-0! dark:bg-transparent!">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <PostinoLogo className="h-7 w-7" />
            <span className="font-bold text-xl text-gray-900">Postino</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">{t.nav.signIn}</Button>
            </Link>
            <Link href="/register">
              <Button>{t.nav.getStarted}</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ui-fade-up">
        <div className="py-20 text-center ui-stagger">
          <div className="inline-flex items-center">
            <PostinoLogo className="h-24 w-24" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Postino
            <br />
            <span className="relative inline-grid align-baseline h-[1.55em] min-w-[12ch] leading-[1.2] overflow-hidden">
              {hero.words.map((word) => (
                <span
                  key={word}
                  className="looping-hero-word text-[1.16em] text-transparent bg-clip-text bg-linear-to-r from-[#7c3aed] via-[#a855f7] to-[#c084fc] dark:from-[#a78bfa] dark:via-[#c084fc] dark:to-[#ddd6fe]"
                >
                  {word}
                </span>
              ))}
            </span>
            <br />
            {hero.emailsAndNewsletters}
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto whitespace-pre-line">
            {hero.subtitle}
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="shadow-lg shadow-yellow-200/70 dark:shadow-violet-900/40">
                {hero.startFree}
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="secondary">
                {hero.howItWorks}
              </Button>
            </Link>
          </div>
        </div>

        <section id="how-it-works" className="py-16 ui-fade-up">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">{howItWorks.title}</h2>
          <div className="grid md:grid-cols-3 gap-8 ui-stagger">
            {steps.map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-100 text-[#8f7a18] dark:bg-violet-400/20 dark:text-violet-200 text-2xl mb-4">
                  <i className={item.icon} aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 ui-fade-up">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">{exampleRules.title}</h2>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto ui-stagger">
            {exampleRules.rules.map((rule) => (
              <div
                key={rule}
                className="flex items-center gap-3 glass-panel rounded-xl p-4 border-(--accent)! dark:border-white/12!"
              >
                <i className="bi bi-check-circle-fill text-(--accent) mt-0.5" aria-hidden="true" />
                <p className="text-sm text-gray-700">{rule}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
