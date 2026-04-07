'use client';

import { useI18n } from '@/lib/i18n';
import { extractStoredPlaceNames } from '@/lib/place-utils';
import type { EmailAnalysis } from '@/types';

const DEFAULT_BADGE_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: DEFAULT_BADGE_COLOR,
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const TYPE_COLORS: Record<string, string> = {
  newsletter: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  transactional: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  promotional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  personal: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  notification: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  automated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  other: DEFAULT_BADGE_COLOR,
};

interface EmailAnalysisPanelProps {
  analysis: EmailAnalysis;
}

export function EmailAnalysisPanel({ analysis }: EmailAnalysisPanelProps) {
  const { t } = useI18n();
  const eh = t.dashboard.emailHistory;
  const ts = t.dashboard.search;
  const hasTags = analysis.tags && analysis.tags.length > 0;
  const hasTopics = analysis.topics && analysis.topics.length > 0;
  const { entities } = analysis;
  const placeNames = extractStoredPlaceNames(entities.places, entities.placeNames);

  const typeLabel: Record<string, string> = {
    newsletter: ts.typeNewsletter,
    transactional: ts.typeTransactional,
    promotional: ts.typePromotional,
    personal: ts.typePersonal,
    notification: ts.typeNotification,
    automated: ts.typeAutomated,
    other: ts.typeOther,
  };
  const sentimentLabel: Record<string, string> = {
    positive: ts.sentimentPositive,
    neutral: ts.sentimentNeutral,
    negative: ts.sentimentNegative,
  };
  const priorityLabel: Record<string, string> = {
    low: ts.priorityLow,
    normal: ts.priorityNormal,
    high: ts.priorityHigh,
    critical: ts.priorityCritical,
  };
  const senderLabel: Record<string, string> = {
    human: ts.senderHuman,
    automated: ts.senderAutomated,
    business: ts.senderBusiness,
    newsletter: ts.senderNewsletter,
  };

  return (
    <div className="mt-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[analysis.emailType] ?? DEFAULT_BADGE_COLOR}`}
        >
          {typeLabel[analysis.emailType] ?? analysis.emailType}
        </span>
        {analysis.sentiment && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${SENTIMENT_COLORS[analysis.sentiment] ?? DEFAULT_BADGE_COLOR}`}
          >
            {sentimentLabel[analysis.sentiment] ?? analysis.sentiment}
          </span>
        )}
        {analysis.priority && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLORS[analysis.priority] ?? DEFAULT_BADGE_COLOR}`}
          >
            {priorityLabel[analysis.priority] ?? analysis.priority}
          </span>
        )}
        {analysis.senderType && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {senderLabel[analysis.senderType] ?? analysis.senderType}
          </span>
        )}
        {analysis.language && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${DEFAULT_BADGE_COLOR}`}
          >
            {analysis.language.toUpperCase()}
          </span>
        )}
        {analysis.requiresResponse && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            {eh.analysisRequiresResponse}
          </span>
        )}
      </div>

      {analysis.intent && (
        <p className="text-xs text-gray-600 dark:text-gray-300">
          <span className="font-medium text-gray-500 dark:text-gray-400">{eh.analysisIntent} </span>
          {analysis.intent}
        </p>
      )}

      {analysis.summary && (
        <p className="text-xs text-gray-600 dark:text-gray-300 italic">{analysis.summary}</p>
      )}

      {hasTags && (
        <div className="flex flex-wrap gap-1">
          {analysis.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {hasTopics && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium">{eh.analysisTopics} </span>
          {analysis.topics.join(' · ')}
        </p>
      )}

      {(entities || (analysis.prices && analysis.prices.length > 0)) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {entities && entities.people.length > 0 && (
            <>
              <dt className="text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                {eh.analysisEntitiesPeople}
              </dt>
              <dd className="text-gray-600 dark:text-gray-300 min-w-0">
                {entities.people.join(', ')}
              </dd>
            </>
          )}
          {entities && entities.organizations.length > 0 && (
            <>
              <dt className="text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                {eh.analysisEntitiesOrganizations}
              </dt>
              <dd className="text-gray-600 dark:text-gray-300 min-w-0">
                {entities.organizations.join(', ')}
              </dd>
            </>
          )}
          {entities && placeNames.length > 0 && (
            <>
              <dt className="text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                {eh.analysisEntitiesPlaces}
              </dt>
              <dd className="text-gray-600 dark:text-gray-300 min-w-0">
                {placeNames.join(', ')}
              </dd>
            </>
          )}
          {entities && entities.events.length > 0 && (
            <>
              <dt className="text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                {eh.analysisEntitiesEvents}
              </dt>
              <dd className="text-gray-600 dark:text-gray-300 min-w-0">
                {entities.events.join(', ')}
              </dd>
            </>
          )}
          {entities && entities.dates.length > 0 && (
            <>
              <dt className="text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                {eh.analysisEntitiesDates}
              </dt>
              <dd className="text-gray-600 dark:text-gray-300 min-w-0">
                {entities.dates.join(', ')}
              </dd>
            </>
          )}
          {analysis.prices && analysis.prices.length > 0 && (
            <>
              <dt className="text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                {eh.analysisEntitiesPrices}
              </dt>
              <dd className="text-gray-600 dark:text-gray-300 min-w-0">
                {analysis.prices.join(', ')}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
