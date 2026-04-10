'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------
export type Locale = 'en' | 'it' | 'es' | 'fr' | 'de';

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

// ---------------------------------------------------------------------------
// Translation type (all leaf values are strings)
// ---------------------------------------------------------------------------
export interface Translations {
  nav: {
    signIn: string;
    getStarted: string;
    signOut: string;
    dashboard: string;
    admin: string;
    allRightsReserved: string;
  };
  language: {
    select: string;
  };
  home: {
    hero: {
      words: string[];
      emailsAndNewsletters: string;
      subtitle: string;
      startFree: string;
      howItWorks: string;
    };
    howItWorks: {
      title: string;
      step1: { title: string; desc: string };
      step2: { title: string; desc: string };
      step3: { title: string; desc: string };
    };
    exampleRules: {
      title: string;
      rules: string[];
    };
    blog: {
      title: string;
      subtitle: string;
      readMore: string;
      backToBlog: string;
      cta: {
        title: string;
        subtitle: string;
        button: string;
      };
    };
  };
  auth: {
    login: {
      welcomeBack: string;
      signInToAccount: string;
      emailAddress: string;
      password: string;
      forgotPassword: string;
      signIn: string;
      noAccount: string;
      signUp: string;
      errors: {
        invalidCredential: string;
        tooManyRequests: string;
        failed: string;
        suspended: string;
        emailNotVerified: string;
      };
    };
    register: {
      createAccount: string;
      getYourAddress: string;
      emailAddress: string;
      password: string;
      minChars: string;
      confirmPassword: string;
      repeatPassword: string;
      alreadyHaveAccount: string;
      signIn: string;
      button: string;
      maintenanceMessage: string;
      errors: {
        passwordsMismatch: string;
        passwordTooShort: string;
        emailAlreadyInUse: string;
        weakPassword: string;
        blockedDomain: string;
        failed: string;
      };
    };
    forgotPassword: {
      title: string;
      subtitle: string;
      emailAddress: string;
      sendResetLink: string;
      rememberedPassword: string;
      backToSignIn: string;
      successMessage: string;
      errors: {
        invalidEmail: string;
        tooManyAttempts: string;
        failed: string;
      };
    };
    dashboardLink: {
      alreadySignedIn: string;
      goToDashboard: string;
      loadingDashboard: string;
    };
  };
  dashboard: {
    title: string;
    subtitle: string;
    tabs: {
      overview: string;
      myRules: string;
      emailHistory: string;
      inbox: string;
      explore: string;
      relations: string;
      settings: string;
      agent: string;
    };
    address: {
      title: string;
      active: string;
      disabled: string;
      activeDescription: string;
      disabledDescription: string;
      copy: string;
      copied: string;
      toggleAriaLabel: string;
      aiAnalysisOnly: string;
      aiAnalysisOnlyEnabledDescription: string;
      aiAnalysisOnlyDisabledDescription: string;
      aiAnalysisOnlyToggleAriaLabel: string;
    };
    stats: {
      emailsReceived: string;
      emailsForwarded: string;
      emailsErrored: string;
      emailsSkipped: string;
      tokensUsed: string;
      estCost: string;
      period: string;
      last24h: string;
      last7days: string;
      lastMonth: string;
      allTime: string;
    };
    pushNotifications: {
      title: string;
      enabledDescription: string;
      disabledDescription: string;
      blockedDescription: string;
    };
    forwardingHeader: {
      title: string;
      enabledDescription: string;
      disabledDescription: string;
    };
    analysisLanguage: {
      title: string;
      description: string;
      selectPlaceholder: string;
      autoLabel: string;
    };
    installApp: {
      title: string;
      description: string;
      buttonLabel: string;
      alreadyInstalled: string;
    };
    deleteEntities: {
      title: string;
      description: string;
      buttonLabel: string;
      confirmTitle: string;
      confirmDescription: string;
      cancel: string;
      confirmButton: string;
      successToast: string;
      errorToast: string;
    };
    clearAnalysis: {
      title: string;
      description: string;
      buttonLabel: string;
      confirmTitle: string;
      confirmDescription: string;
      cancel: string;
      confirmButton: string;
      successToast: string;
      errorToast: string;
    };
    resetUsageStats: {
      title: string;
      description: string;
      buttonLabel: string;
      confirmTitle: string;
      confirmDescription: string;
      cancel: string;
      confirmButton: string;
      successToast: string;
      errorToast: string;
    };
    clearMemories: {
      title: string;
      description: string;
      buttonLabel: string;
      confirmTitle: string;
      confirmDescription: string;
      cancel: string;
      confirmButton: string;
      successToast: string;
      errorToast: string;
    };
    charts: {
      myEmailVolume: string;
      received: string;
      processing: string;
      forwarded: string;
      error: string;
      skipped: string;
      estimatedCost: string;
      estCost: string;
      last24h: string;
      last7days: string;
      last30days: string;
      perHour: string;
      perDay: string;
      perWeek: string;
      weekOf: string;
    };
    emailHistory: {
      allStatuses: string;
      filterByStatus: string;
      refresh: string;
      showPostinoHeader: string;
      noEmailsWithStatus: string;
      clearFilter: string;
      noEmailsYet: string;
      noEmailsYetDesc: string;
      selectEmailToRead: string;
      from: string;
      to: string;
      cc: string;
      bcc: string;
      attachments: string;
      downloadAttachment: string;
      noAttachmentsShort: string;
      ruleApplied: string;
      tokens: string;
      viewOriginal: string;
      viewFullPage: string;
      loadingEmail: string;
      searchPlaceholder: string;
      withAttachments: string;
      applyFilters: string;
      results: string;
      messages: string;
      previous: string;
      next: string;
      page: string;
      of: string;
      tabSummary: string;
      tabContent: string;
      tabAiAnalysis: string;
      noAiAnalysis: string;
      aiAnalysis: string;
      analysisType: string;
      analysisSentiment: string;
      analysisPriority: string;
      analysisLanguage: string;
      analysisSenderType: string;
      analysisIntent: string;
      analysisTags: string;
      analysisTopics: string;
      analysisRequiresResponse: string;
      analysisEntitiesPeople: string;
      analysisEntitiesOrganizations: string;
      analysisEntitiesPlaces: string;
      analysisEntitiesEvents: string;
      analysisEntitiesDates: string;
      analysisEntitiesPrices: string;
      rerunAnalysis: string;
      rerunningAnalysis: string;
      deleteEmail: string;
      deleteEmailConfirm: string;
      deleteEmailSuccess: string;
      deleteEmailError: string;
      failedToLoad: string;
      failedToLoadCount: string;
    };
    search: {
      title: string;
      toggleFilters: string;
      searchPlaceholder: string;
      applyFilters: string;
      noResults: string;
      filterStatus: string;
      filterSentiment: string;
      filterCategory: string;
      filterPriority: string;
      filterSenderType: string;
      filterLanguage: string;
      filterTags: string;
      filterPeople: string;
      filterOrgs: string;
      filterPlaces: string;
      filterEvents: string;
      filterNumbers: string;
      languagePlaceholder: string;
      tagsPlaceholder: string;
      peoplePlaceholder: string;
      orgsPlaceholder: string;
      placesPlaceholder: string;
      eventsPlaceholder: string;
      numbersPlaceholder: string;
      advancedFilters: string;
      withAttachments: string;
      requiresResponse: string;
      hasActionItems: string;
      isUrgent: string;
      allSentiments: string;
      sentimentPositive: string;
      sentimentNeutral: string;
      sentimentNegative: string;
      allCategories: string;
      typeNewsletter: string;
      typeTransactional: string;
      typePromotional: string;
      typePersonal: string;
      typeNotification: string;
      typeAutomated: string;
      typeOther: string;
      allPriorities: string;
      priorityLow: string;
      priorityNormal: string;
      priorityHigh: string;
      priorityCritical: string;
      allSenderTypes: string;
      senderHuman: string;
      senderAutomated: string;
      senderBusiness: string;
      senderNewsletter: string;
    };
    knowledge: {
      title: string;
      subtitle: string;
      allCategories: string;
      topics: string;
      people: string;
      organizations: string;
      places: string;
      events: string;
      tags: string;
      numbers: string;
      emailsAnalyzed: string;
      noData: string;
      noDataDesc: string;
      searchInInbox: string;
      loading: string;
      mentions: string;
      relatedEmails: string;
      relatedEmailsDesc: string;
      noRelatedEmails: string;
      merge: string;
      mergeMode: string;
      cancelMerge: string;
      mergeSelected: string;
      mergeDialogTitle: string;
      mergeDialogDesc: string;
      canonicalName: string;
      canonicalNamePlaceholder: string;
      mergeChipHint: string;
      createMerge: string;
      mergeSameCategoryWarning: string;
      manageMerges: string;
      noMerges: string;
      deleteMerge: string;
      deleteConfirm: string;
      mergesTitle: string;
      mergesDesc: string;
      listTab: string;
      mergedTab: string;
      suggestionsTab: string;
      xSelected: string;
      mergedFrom: string;
      mergeCreated: string;
      mergeDeleted: string;
      cannotBeUndone: string;
      suggestionsAskAI: string;
      suggestionsAskAIDesc: string;
      suggestionsGenerating: string;
      suggestionsEmpty: string;
      suggestionsEmptyDesc: string;
      suggestionsAccept: string;
      suggestionsReject: string;
      suggestionsCompleteFirst: string;
      suggestionsError: string;
      failedToLoad: string;
      failedToLoadMerges: string;
      failedToLoadSuggestions: string;
      suggestionsGenerated: string;
      relations: {
        viewToggle: string;
        exploreToggle: string;
        title: string;
        subtitle: string;
        generate: string;
        generating: string;
        regenerate: string;
        noGraph: string;
        noGraphDesc: string;
        generatedOn: string;
        totalEmails: string;
        error: string;
        nodeClickHint: string;
        nodeClickHint2: string;
        openRelatedEmails: string;
        expandFullPage: string;
        closeFullPage: string;
        legend: string;
        loadError: string;
        generated: string;
        graphTab: string;
        flowTab: string;
        mapTab: string;
        flowNodeClick: string;
        flowGenerate: string;
        flowGenerating: string;
        flowRegenerate: string;
        flowNoGraph: string;
        flowNoGraphDesc: string;
        flowError: string;
        flowLoadError: string;
        flowGenerated: string;
        flowGeneratedOn: string;
        flowTotalEmails: string;
        mapPinClick: string;
        mapGenerate: string;
        mapRegenerate: string;
        mapNoGraph: string;
        mapNoGraphDesc: string;
        mapError: string;
        mapLoadError: string;
        mapGenerated: string;
        mapGeneratedOn: string;
        mapTotalEmails: string;
      };
    };
    rules: {
      yourRules: string;
      active: string;
      disabled: string;
      appliedTopToBottom: string;
      useArrows: string;
      addARule: string;
      newRule: string;
      ruleName: string;
      ruleDescription: string;
      hideFilters: string;
      addFilters: string;
      editFilters: string;
      filterHelp: string;
      senderContains: string;
      subjectContains: string;
      bodyContains: string;
      ruleNamePlaceholder: string;
      ruleDescriptionPlaceholder: string;
      senderPlaceholder: string;
      subjectPlaceholder: string;
      bodyPlaceholder: string;
      addRule: string;
      cancel: string;
      saveChanges: string;
      noRulesYet: string;
      exampleRule: string;
      sender: string;
      subject: string;
      body: string;
      updated: string;
      moveRuleUp: string;
      moveRuleDown: string;
      processingOrder: string;
      edit: string;
      delete: string;
      deleteRule: string;
      deleteConfirm: string;
      cannotBeUndone: string;
      close: string;
      searchPlaceholder: string;
      noMatchingRules: string;
      ruleCreated: string;
      ruleSaved: string;
      ruleEnabled: string;
      ruleDisabled: string;
      ruleDeleted: string;
      errors: {
        nameRequired: string;
        textRequired: string;
        nameTooLong: string;
        textTooLong: string;
        failedToCreate: string;
        failedToUpdate: string;
        failedToDelete: string;
        failedToReorder: string;
      };
    };
    pwaInstall: {
      title: string;
      description: string;
      howToTitle: string;
      // iOS Safari / Edge / Opera (blue share button in bottom toolbar)
      iosSafariStep1Pre: string;
      iosSafariStep1Post: string;
      iosSafariStep2Pre: string;
      iosSafariStep2Bold: string;
      iosSafariStep3: string;
      // iOS 26 Safari — iPhone (4 steps: ... → Share → More → Add to Home Screen)
      iosSafari26Step1Pre: string;
      iosSafari26Step1Post: string;
      iosSafari26Step2Pre: string;
      iosSafari26Step2Bold: string;
      iosSafari26Step2Post: string;
      iosSafari26Step3Pre: string;
      iosSafari26Step3Bold: string;
      iosSafari26Step4Pre: string;
      iosSafari26Step4Bold: string;
      iosSafari26Step4Post: string;
      // iOS 26 Safari — iPad step 1 (Share is already in the toolbar; steps 3+4 reused from above)
      iosSafari26iPadStep1Pre: string;
      iosSafari26iPadStep1Post: string;
      // iOS Chrome (dark-gray share button in upper-right corner)
      iosChromeStep1Pre: string;
      iosChromeStep1Post: string;
      iosChromeStep2Pre: string;
      iosChromeStep2Bold: string;
      iosChromeStep2Post: string;
      iosChromeStep3: string;
      // Android manual — all browsers use the ⋮ three-dot menu (when beforeinstallprompt is not available)
      androidStep1Pre: string;
      androidStep1Post: string;
      androidStep2Pre: string;
      androidStep2Bold: string;
      androidStep3: string;
      installButton: string;
      notNow: string;
    };
    toasts: {
      settingSaved: string;
      failedToLoadStats: string;
      failedToUpdateEmailSetting: string;
      failedToUpdateForwardingHeaderSetting: string;
      failedToUpdateAiAnalysisOnlySetting: string;
      failedToUpdateAnalysisLanguageSetting: string;
      analysisRefreshed: string;
      analysisRefreshFailed: string;
      downloadAttachmentFailed: string;
    };
    agent: {
      title: string;
      subtitle: string;
      placeholder: string;
      inputPlaceholder: string;
      send: string;
      noAnswer: string;
      errorFallback: string;
      sendHint: string;
      clearConversation: string;
      clearConfirmTitle: string;
      clearConfirmDescription: string;
      clearConfirmButton: string;
      cancelClear: string;
      expandFullPage: string;
      closeFullPage: string;
      sourceEmails: string;
      cta: {
        title: string;
        description: string;
        button: string;
      };
    };
  };
  emailOriginal: {
    back: string;
    originalEmail: string;
    from: string;
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    received: string;
    emailContent: string;
    openFullPageView: string;
    openFullPageViewAria: string;
    noOriginalContent: string;
    closeFullPageView: string;
    attachments: string;
    noAttachments: string;
    errors: {
      noPermission: string;
      notFound: string;
      failedToLoad: string;
    };
    admin: {
      currentSetup: string;
      loadingModels: string;
      defaultModel: string;
      searchModels: string;
      noModelsFound: string;
      processing: string;
      analyze: string;
      failedToAnalyze: string;
      analysisResult: string;
      extractedMarkdown: string;
      modelUsed: string;
      reprocess: string;
      failedToReprocess: string;
      ruleApplied: string;
      tokensUsed: string;
      estCost: string;
      processedBody: string;
    };
  };
  admin: {
    users: {
      rerunAnalysis: string;
      rerunAnalysisTitle: string;
      rerunAnalysisDesc: string;
      rerunAnalysisPreparing: string;
      rerunAnalysisProgress: string;
      rerunAnalysisRetry: string;
      resetData: string;
      resetDataTitle: string;
      resetDataDesc: string;
    };
    toasts: {
      settingsSaved: string;
      failedToLoadStats: string;
      failedToLoadChartData: string;
      userDeleted: string;
      adminGranted: string;
      adminRemoved: string;
      userSuspended: string;
      userActivated: string;
      userAnalysesRerun: string;
      userAnalysesRerunPartial: string;
      failedToRerunUserAnalyses: string;
      userDataReset: string;
      failedToResetUserData: string;
      failedToUpdateUser: string;
      failedToProcessQueue: string;
      failedToUpdateMailgunSetting: string;
      failedToClearLogs: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Translation dictionaries
// ---------------------------------------------------------------------------
const translations: Record<Locale, Translations> = {
  en: {
    nav: {
      signIn: 'Sign in',
      getStarted: 'Get started',
      signOut: 'Sign out',
      dashboard: 'Dashboard',
      admin: 'Admin',
      allRightsReserved: 'All rights reserved.',
    },
    language: {
      select: 'Language',
    },
    home: {
      hero: {
        words: ['summarize', 'organizes', 'translates', 'polishes'],
        emailsAndNewsletters: 'e-mails & newsletters',
        subtitle:
          "Get a private email address.\nWrite simple rules in natural language.\nPostino's AI processes your incoming emails — summarizing newsletters, removing ads, extracting key info, translate and much more — then forwards the result to you.",
        startFree: 'Start for free',
        howItWorks: 'How it works',
      },
      howItWorks: {
        title: 'How it works',
        step1: {
          title: 'Get your address',
          desc: 'Sign up and get a unique Postino email address like amber-2026@postino.pro',
        },
        step2: {
          title: 'Write your rules',
          desc: 'Tell Postino what to do in plain English: "Summarize newsletters", "Remove promotional content", etc.',
        },
        step3: {
          title: 'Receive processed email',
          desc: 'Postino processes incoming emails with AI and forwards clean, useful content to your real inbox.',
        },
      },
      exampleRules: {
        title: 'Example rules',
        rules: [
          'Summarize newsletters and remove all ads and promotional content',
          'Extract and list only the important action items from emails',
          'Translate emails to English and summarize the main points',
          'For receipts and order confirmations, extract only the order details and total',
          'Remove tracking pixels and rewrite links to be clean',
          'If the email is a promotional offer, ignore it entirely',
        ],
      },
      blog: {
        title: 'Postino Blog',
        subtitle: 'Tips, updates and insights from the Postino team',
        readMore: 'Read more',
        backToBlog: 'Back to Blog',
        cta: {
          title: 'Read our Blog',
          subtitle: 'Discover tips, guides and updates about AI-powered email management.',
          button: 'Explore Articles',
        },
      },
    },
    auth: {
      login: {
        welcomeBack: 'Welcome back',
        signInToAccount: 'Sign in to your account',
        emailAddress: 'Email address',
        password: 'Password',
        forgotPassword: 'Forgot password?',
        signIn: 'Sign in',
        noAccount: "Don't have an account?",
        signUp: 'Sign up',
        errors: {
          invalidCredential: 'Invalid email or password',
          tooManyRequests: 'Too many failed attempts. Please try again later.',
          failed: 'Failed to sign in. Please try again.',
          suspended: 'Your account has been suspended. Please contact support.',
          emailNotVerified: 'Please verify your email address before signing in.',
        },
      },
      register: {
        createAccount: 'Create your account',
        getYourAddress: 'Get your personal Postino address',
        emailAddress: 'Email address',
        password: 'Password',
        minChars: 'Min. 8 characters',
        confirmPassword: 'Confirm password',
        repeatPassword: 'Repeat password',
        alreadyHaveAccount: 'Already have an account?',
        signIn: 'Sign in',
        button: 'Create account',
        maintenanceMessage:
          "We're working on improving the service. New user registrations are suspended during maintenance. Please try again later.",
        errors: {
          passwordsMismatch: 'Passwords do not match',
          passwordTooShort: 'Password must be at least 8 characters',
          emailAlreadyInUse: 'An account with this email already exists',
          weakPassword: 'Password is too weak',
          blockedDomain: "Can't create an account using our email addresses",
          failed: 'Failed to create account. Please try again.',
        },
      },
      forgotPassword: {
        title: 'Reset your password',
        subtitle: 'Enter your email to receive a reset link',
        emailAddress: 'Email address',
        sendResetLink: 'Send reset link',
        rememberedPassword: 'Remembered your password?',
        backToSignIn: 'Back to sign in',
        successMessage: 'If an account exists for this email, we sent you a password reset link.',
        errors: {
          invalidEmail: 'Invalid email address',
          tooManyAttempts: 'Too many attempts. Please try again later.',
          failed: 'Failed to send reset email. Please try again.',
        },
      },
      dashboardLink: {
        alreadySignedIn: 'You are already signed in.',
        goToDashboard: 'Go to Dashboard',
        loadingDashboard: 'Loading dashboard…',
      },
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Manage your Postino address and email rules',
      tabs: {
        overview: 'Overview',
        myRules: 'My Rules',
        emailHistory: 'Email History',
        inbox: 'Inbox',
        explore: 'Explore',
        relations: 'Relations',
        settings: 'Settings',
        agent: 'Memory',
      },
      address: {
        title: 'Your Postino Address',
        active: 'Active',
        disabled: 'Disabled',
        activeDescription:
          "Send emails to this address and they'll be processed according to your rules, then forwarded to your email",
        disabledDescription:
          'Your Postino address is disabled. Incoming emails will be registered as skipped and not forwarded.',
        copy: 'Copy',
        copied: 'Copied',
        toggleAriaLabel: 'Enable or disable your Postino address',
        aiAnalysisOnly: 'AI Analysis Only',
        aiAnalysisOnlyEnabledDescription:
          'Incoming emails are analysed by AI and saved to memory, but rules and forwarding are skipped.',
        aiAnalysisOnlyDisabledDescription:
          'Enable to analyse emails with AI and update memory even when forwarding is disabled.',
        aiAnalysisOnlyToggleAriaLabel: 'Enable or disable AI analysis only mode',
      },
      stats: {
        emailsReceived: 'Emails Received',
        emailsForwarded: 'Emails Forwarded',
        emailsErrored: 'Emails Errored',
        emailsSkipped: 'Emails Skipped',
        tokensUsed: 'Tokens Used',
        estCost: 'Est. Cost',
        period: 'Period',
        last24h: 'Last 24h',
        last7days: 'Last 7 days',
        lastMonth: 'Last month',
        allTime: 'All time',
      },
      pushNotifications: {
        title: 'Push Notifications',
        enabledDescription:
          'You will receive a browser notification each time an email is processed.',
        disabledDescription:
          'Enable to receive a browser notification whenever a new email is processed.',
        blockedDescription:
          "Notifications are blocked by your browser. Open your browser's site settings and allow notifications for this site to enable this feature.",
      },
      forwardingHeader: {
        title: 'Postino Header in Forwarded Emails',
        enabledDescription:
          'A Postino summary box is appended to the bottom of every forwarded email.',
        disabledDescription: 'The Postino summary box is not appended to forwarded emails.',
      },
      analysisLanguage: {
        title: 'AI Analysis Language',
        description:
          'Choose the language for AI-generated analysis content (summary, intent, tags, topics). Select "Auto" to use English (default).',
        selectPlaceholder: 'Select language',
        autoLabel: 'Auto (English)',
      },
      installApp: {
        title: 'Install Postino App',
        description:
          'Install Postino as an app on your device for a faster, native-like experience.',
        buttonLabel: 'Install App',
        alreadyInstalled: 'Already Installed',
      },
      deleteEntities: {
        title: 'Delete All Entities & Merges',
        description:
          'Permanently delete all extracted entity knowledge (people, topics, organizations, places, events, tags) from your emails, all entity merges, and all AI merge suggestions. This cannot be undone.',
        buttonLabel: 'Delete All Entities & Merges',
        confirmTitle: 'Delete All Entities & Merges?',
        confirmDescription:
          'This will permanently delete all extracted entity knowledge from your emails, all merges, and AI merge suggestions. This action cannot be undone.',
        cancel: 'Cancel',
        confirmButton: 'Delete All',
        successToast: 'All entity data deleted.',
        errorToast: 'Failed to delete entity data.',
      },
      clearAnalysis: {
        title: 'Delete All AI Analysis',
        description:
          'Remove all AI-generated analysis, processed content, token usage, and cost data from your emails. Only the original messages are kept. This also deletes all entity knowledge, merges, and cached graphs. This cannot be undone.',
        buttonLabel: 'Delete All AI Analysis',
        confirmTitle: 'Delete All AI Analysis?',
        confirmDescription:
          'This will permanently remove all AI analysis, processed content, token usage, entity knowledge, merges, and cached graphs from your emails. Only the original messages are kept. This action cannot be undone.',
        cancel: 'Cancel',
        confirmButton: 'Delete All Analysis',
        successToast: 'All AI analysis data deleted.',
        errorToast: 'Failed to delete AI analysis data.',
      },
      resetUsageStats: {
        title: 'Reset Cost & Token Stats',
        description:
          'Set all saved token and estimated cost values across your processed emails back to zero. This does not delete the emails themselves.',
        buttonLabel: 'Reset Cost & Token Stats',
        confirmTitle: 'Reset Cost & Token Stats?',
        confirmDescription:
          'This will set all saved token and estimated cost values for your processed emails back to zero. This action cannot be undone.',
        cancel: 'Cancel',
        confirmButton: 'Reset Stats',
        successToast: 'Cost and token stats reset.',
        errorToast: 'Failed to reset cost and token stats.',
      },
      clearMemories: {
        title: 'Clear All Memories',
        description:
          'Permanently delete all saved user memories, including local memory history and Supermemory data when configured. This cannot be undone.',
        buttonLabel: 'Clear All Memories',
        confirmTitle: 'Clear All Memories?',
        confirmDescription:
          'This will permanently delete all your saved memories. This action cannot be undone.',
        cancel: 'Cancel',
        confirmButton: 'Clear Memories',
        successToast: 'All memories cleared.',
        errorToast: 'Failed to clear memories.',
      },
      charts: {
        myEmailVolume: 'My Email Volume',
        received: 'Received',
        processing: 'Processing',
        forwarded: 'Forwarded',
        error: 'Error',
        skipped: 'Skipped',
        estimatedCost: 'Estimated Cost',
        estCost: 'Est. Cost',
        last24h: 'Last 24h',
        last7days: 'Last 7 days',
        last30days: 'Last 30 days',
        perHour: 'Per Hour',
        perDay: 'Per Day',
        perWeek: 'Per Week',
        weekOf: 'Week of',
      },
      emailHistory: {
        allStatuses: 'All statuses',
        filterByStatus: 'Filter by status',
        refresh: 'Refresh',
        showPostinoHeader: 'Show Postino header in forwarded emails',
        noEmailsWithStatus: 'No emails with status',
        clearFilter: 'Remove filters',
        noEmailsYet: 'No emails processed yet.',
        noEmailsYetDesc: 'Send an email to your Postino address to get started!',
        selectEmailToRead: 'Select an email to read',
        from: 'From:',
        to: 'To:',
        cc: 'Cc:',
        bcc: 'Bcc:',
        attachments: 'Attachments:',
        downloadAttachment: 'Download attachment',
        noAttachmentsShort: 'None',
        ruleApplied: 'Rule applied:',
        tokens: 'Tokens:',
        viewOriginal: 'View original email',
        viewFullPage: 'Full page',
        loadingEmail: 'Loading email…',
        searchPlaceholder: 'Search emails…',
        withAttachments: 'With attachments',
        applyFilters: 'Search',
        results: 'results',
        messages: 'messages',
        previous: 'Previous',
        next: 'Next',
        page: 'Page',
        of: 'of',
        aiAnalysis: 'AI Analysis',
        tabSummary: 'Details',
        tabContent: 'Content',
        tabAiAnalysis: 'AI',
        noAiAnalysis: 'No AI analysis available.',
        analysisType: 'Type:',
        analysisSentiment: 'Sentiment:',
        analysisPriority: 'Priority:',
        analysisLanguage: 'Language:',
        analysisSenderType: 'Sender type:',
        analysisIntent: 'Intent:',
        analysisTags: 'Tags:',
        analysisTopics: 'Topics:',
        analysisRequiresResponse: 'Requires response',
        analysisEntitiesPeople: 'People:',
        analysisEntitiesOrganizations: 'Organizations:',
        analysisEntitiesPlaces: 'Places:',
        analysisEntitiesEvents: 'Events:',
        analysisEntitiesDates: 'Dates:',
        analysisEntitiesPrices: 'Prices:',
        rerunAnalysis: 'Repeat analysis',
        rerunningAnalysis: 'Repeating analysis...',
        deleteEmail: 'Delete email',
        deleteEmailConfirm:
          'Are you sure you want to permanently delete this email? This action cannot be undone.',
        deleteEmailSuccess: 'Email deleted.',
        deleteEmailError: 'Failed to delete email.',
        failedToLoad: 'Failed to load emails',
        failedToLoadCount: 'Failed to load email count',
      },
      search: {
        title: 'Search Emails',
        toggleFilters: 'Toggle filters',
        searchPlaceholder: 'Search by subject, sender, summary, tags…',
        applyFilters: 'Search',
        noResults: 'No emails match your filters.',
        filterStatus: 'Status',
        filterSentiment: 'Sentiment',
        filterCategory: 'Category',
        filterPriority: 'Priority',
        filterSenderType: 'Sender type',
        filterLanguage: 'Language',
        filterTags: 'Tags',
        filterPeople: 'People',
        filterOrgs: 'Organizations',
        filterPlaces: 'Places',
        filterEvents: 'Events',
        filterNumbers: 'Numbers & codes',
        languagePlaceholder: 'Select language…',
        tagsPlaceholder: 'Select tags…',
        peoplePlaceholder: 'Select people…',
        orgsPlaceholder: 'Select organizations…',
        placesPlaceholder: 'Select places…',
        eventsPlaceholder: 'Select events…',
        numbersPlaceholder: 'Select numbers/codes…',
        advancedFilters: 'Advanced filters',
        withAttachments: 'With attachments',
        requiresResponse: 'Requires response',
        hasActionItems: 'Has action items',
        isUrgent: 'Urgent',
        allSentiments: 'All sentiments',
        sentimentPositive: 'Positive',
        sentimentNeutral: 'Neutral',
        sentimentNegative: 'Negative',
        allCategories: 'All categories',
        typeNewsletter: 'Newsletter',
        typeTransactional: 'Transactional',
        typePromotional: 'Promotional',
        typePersonal: 'Personal',
        typeNotification: 'Notification',
        typeAutomated: 'Automated',
        typeOther: 'Other',
        allPriorities: 'All priorities',
        priorityLow: 'Low',
        priorityNormal: 'Normal',
        priorityHigh: 'High',
        priorityCritical: 'Critical',
        allSenderTypes: 'All sender types',
        senderHuman: 'Human',
        senderAutomated: 'Automated',
        senderBusiness: 'Business',
        senderNewsletter: 'Newsletter',
      },
      knowledge: {
        title: 'Explore emails',
        subtitle: 'Explore topics, people and organizations from your emails',
        allCategories: 'All',
        topics: 'Topics',
        people: 'People',
        organizations: 'Organizations',
        places: 'Places',
        events: 'Events',
        tags: 'Tags',
        numbers: 'Numbers & codes',
        emailsAnalyzed: '{count} emails analyzed',
        noData: 'No knowledge data yet',
        noDataDesc:
          'Send some emails to your Postino address to start building your knowledge graph.',
        searchInInbox: 'Search in inbox',
        loading: 'Loading…',
        mentions: 'mentions',
        relatedEmails: 'Related emails',
        relatedEmailsDesc: 'Emails mentioning',
        noRelatedEmails: 'No emails found for this term.',
        merge: 'Merge',
        mergeMode: 'Select to merge',
        cancelMerge: 'Cancel',
        mergeSelected: 'Merge selected',
        mergeDialogTitle: 'Merge Entities',
        mergeDialogDesc: 'These entities will be combined into one.',
        canonicalName: 'Canonical name',
        canonicalNamePlaceholder: 'Name to display',
        mergeChipHint: 'Click a name to use it as the canonical name',
        createMerge: 'Create merge',
        mergeSameCategoryWarning: 'Select 2 or more entities from the same category to merge.',
        manageMerges: 'Manage merges',
        noMerges: 'No merges defined yet.',
        deleteMerge: 'Delete merge',
        deleteConfirm: 'Are you sure you want to delete',
        mergesTitle: 'Entity Merges',
        mergesDesc: 'Entities you have merged are shown as a single item in the knowledge view.',
        listTab: 'List',
        mergedTab: 'Merged',
        suggestionsTab: 'Suggestions',
        xSelected: '{count} selected',
        mergedFrom: 'Merged from',
        mergeCreated: 'Merge created',
        mergeDeleted: 'Merge deleted',
        cannotBeUndone: 'This action cannot be undone.',
        suggestionsAskAI: 'Ask AI for suggestions',
        suggestionsAskAIDesc: 'AI will analyze your entities and suggest possible merges.',
        suggestionsGenerating: 'Generating suggestions…',
        suggestionsEmpty: 'No suggestions yet',
        suggestionsEmptyDesc: 'Click the button above to ask AI to suggest entity merges.',
        suggestionsAccept: 'Accept',
        suggestionsReject: 'Reject',
        suggestionsCompleteFirst: 'Complete all suggestions before generating new ones.',
        suggestionsError: 'Failed to generate suggestions. Please try again.',
        failedToLoad: 'Failed to load knowledge data',
        failedToLoadMerges: 'Failed to load merges',
        failedToLoadSuggestions: 'Failed to load suggestions',
        suggestionsGenerated: 'Suggestions generated',
        relations: {
          viewToggle: 'Relation Map',
          exploreToggle: 'Explore',
          title: 'Relation Map',
          subtitle: 'Connections between entities discovered across your emails',
          generate: 'Generate Relations',
          generating: 'Generating…',
          regenerate: 'Regenerate',
          noGraph: 'No relation map yet',
          noGraphDesc:
            'Click "Generate Relations" to discover connections between entities in your emails.',
          generatedOn: 'Generated on {date}',
          totalEmails: 'Based on {count} emails',
          error: 'Failed to generate relations',
          nodeClickHint: 'Select a node to highlight connections',
          nodeClickHint2: 'Use the button to explore related emails',
          openRelatedEmails: 'Open related emails',
          expandFullPage: 'Full page',
          closeFullPage: 'Close',
          legend: 'Legend',
          loadError: 'Failed to load relation map',
          generated: 'Relation graph updated',
          graphTab: 'Graph',
          flowTab: 'Flow',
          mapTab: 'Map',
          flowNodeClick:
            'Click once to highlight connected entities, then use the button to explore related emails',
          flowGenerate: 'Generate Flow',
          flowGenerating: 'Generating…',
          flowRegenerate: 'Regenerate Flow',
          flowNoGraph: 'No flow chart yet',
          flowNoGraphDesc:
            'Click "Generate Flow" to visualize how entities evolved over time in your emails.',
          flowError: 'Failed to generate flow chart',
          flowLoadError: 'Failed to load flow chart',
          flowGenerated: 'Flow chart updated',
          flowGeneratedOn: 'Generated on {date}',
          flowTotalEmails: 'Based on {count} emails',
          mapPinClick:
            'Click a pin to select a place, then use the button to explore related emails',
          mapGenerate: 'Generate Map',
          mapRegenerate: 'Regenerate Map',
          mapNoGraph: 'No place map yet',
          mapNoGraphDesc:
            'Click "Generate Map" to place the locations mentioned in your emails on a real map.',
          mapError: 'Failed to generate place map',
          mapLoadError: 'Failed to load place map',
          mapGenerated: 'Place map updated',
          mapGeneratedOn: 'Generated on {date}',
          mapTotalEmails: 'Based on {count} emails',
        },
      },
      rules: {
        yourRules: 'Your Rules',
        active: 'Active',
        disabled: 'Disabled',
        appliedTopToBottom: 'Rules are applied top to bottom.',
        useArrows: 'Use the arrows to change the order.',
        addARule: 'Create rule',
        newRule: 'New Rule',
        ruleName: 'Rule Name',
        ruleDescription: 'Rule Description',
        hideFilters: 'Hide filters',
        addFilters: 'Add sender/subject/body filters (optional)',
        editFilters: 'Edit sender/subject/body filters (optional)',
        filterHelp:
          'Apply this rule only when the incoming email matches all provided patterns (case-insensitive contains). Leave blank to apply to all emails.',
        senderContains: 'Sender contains',
        subjectContains: 'Subject contains',
        bodyContains: 'Body contains',
        ruleNamePlaceholder: 'e.g. Newsletter Summarizer',
        ruleDescriptionPlaceholder:
          'Example: Summarize newsletters and remove promotional content. Keep only the key articles and links.',
        senderPlaceholder: 'e.g. newsletter@example.com',
        subjectPlaceholder: 'e.g. Weekly Digest',
        bodyPlaceholder: 'e.g. unsubscribe',
        addRule: 'Add Rule',
        cancel: 'Cancel',
        saveChanges: 'Save changes',
        noRulesYet: 'No rules yet. Add your first rule above!',
        exampleRule: 'Example: "Remove ads and summarize newsletters"',
        sender: 'Sender:',
        subject: 'Subject:',
        body: 'Body:',
        updated: 'Updated',
        moveRuleUp: 'Move rule up',
        moveRuleDown: 'Move rule down',
        processingOrder: 'Processing order',
        edit: 'Edit',
        delete: 'Delete',
        deleteRule: 'Delete rule',
        deleteConfirm: 'Are you sure you want to delete',
        cannotBeUndone: 'This action cannot be undone.',
        close: 'Close',
        searchPlaceholder: 'Search rules…',
        noMatchingRules: 'No rules match your search.',
        ruleCreated: 'Rule created',
        ruleSaved: 'Rule saved',
        ruleEnabled: 'Rule enabled',
        ruleDisabled: 'Rule disabled',
        ruleDeleted: 'Rule deleted',
        errors: {
          nameRequired: 'Rule name is required',
          textRequired: 'Rule text is required',
          nameTooLong: 'Rule name must be at most {max} characters',
          textTooLong: 'Rule exceeds maximum length of {max} characters',
          failedToCreate: 'Failed to create rule',
          failedToUpdate: 'Failed to update rule',
          failedToDelete: 'Failed to delete rule',
          failedToReorder: 'Failed to reorder rules',
        },
      },
      pwaInstall: {
        title: 'Add Postino to your home screen',
        description:
          'Get faster access and a better experience by installing the app on your device.',
        howToTitle: 'How to install:',
        iosSafariStep1Pre: 'Tap the',
        iosSafariStep1Post: 'Share button in the browser toolbar.',
        iosSafariStep2Pre: 'Tap',
        iosSafariStep2Bold: 'Add to Home Screen',
        iosSafariStep3: 'Tap Add in the top-right corner to confirm.',
        iosSafari26Step1Pre: 'Tap the',
        iosSafari26Step1Post: 'button in the browser toolbar.',
        iosSafari26Step2Pre: 'Tap',
        iosSafari26Step2Bold: 'Share',
        iosSafari26Step2Post: 'in the menu.',
        iosSafari26Step3Pre: 'Tap',
        iosSafari26Step3Bold: 'More',
        iosSafari26Step4Pre: 'Select',
        iosSafari26Step4Bold: 'Add to Home Screen',
        iosSafari26Step4Post: 'from the menu. You may need to scroll down.',
        iosSafari26iPadStep1Pre: 'Tap the',
        iosSafari26iPadStep1Post: 'Share button in the browser toolbar.',
        iosChromeStep1Pre: 'Tap the',
        iosChromeStep1Post: 'button in the upper-right corner.',
        iosChromeStep2Pre: 'Select',
        iosChromeStep2Bold: 'Add to Home Screen',
        iosChromeStep2Post: ' from the menu. You may need to scroll down to find it.',
        iosChromeStep3: 'Tap Add to confirm.',
        androidStep1Pre: 'Tap the',
        androidStep1Post: 'menu button in the top-right corner.',
        androidStep2Pre: 'Tap',
        androidStep2Bold: 'Add to Home Screen',
        androidStep3: 'Tap Add to confirm.',
        installButton: 'Install app',
        notNow: 'Not now',
      },
      toasts: {
        settingSaved: 'Setting saved',
        failedToLoadStats: 'Failed to load stats',
        failedToUpdateEmailSetting: 'Failed to update email address setting',
        failedToUpdateForwardingHeaderSetting: 'Failed to update forwarding header setting',
        failedToUpdateAiAnalysisOnlySetting: 'Failed to update AI analysis only setting',
        failedToUpdateAnalysisLanguageSetting: 'Failed to update analysis language setting',
        analysisRefreshed: 'AI analysis refreshed.',
        analysisRefreshFailed: 'Failed to refresh AI analysis.',
        downloadAttachmentFailed: 'Failed to download attachment.',
      },
      agent: {
        title: 'Memory Agent',
        subtitle: 'Ask me about your emails.',
        placeholder: 'Ask something like "What newsletters did I receive this week?"',
        inputPlaceholder: 'Ask about your emails…',
        send: 'Send',
        noAnswer: 'No answer found.',
        errorFallback: 'Something went wrong. Please try again.',
        sendHint: 'AI can make mistakes, always verify.',
        clearConversation: 'Clear conversation',
        clearConfirmTitle: 'Clear conversation?',
        clearConfirmDescription:
          'This will remove all messages from the current session. This action cannot be undone.',
        clearConfirmButton: 'Clear',
        cancelClear: 'Cancel',
        expandFullPage: 'Full page',
        closeFullPage: 'Close',
        sourceEmails: 'Source emails',
        cta: {
          title: 'Your AI email agent is ready',
          description: 'Ask me about your emails.',
          button: 'Ask me everything about your emails!',
        },
      },
    },
    emailOriginal: {
      back: 'Back',
      originalEmail: 'Original Email',
      from: 'From:',
      to: 'To:',
      cc: 'Cc:',
      bcc: 'Bcc:',
      subject: 'Subject:',
      received: 'Received:',
      emailContent: 'Email Content',
      openFullPageView: 'Full page',
      openFullPageViewAria: 'Open email in full page view',
      noOriginalContent: 'No original content stored.',
      closeFullPageView: 'Close full page view',
      attachments: 'Attachments:',
      noAttachments: 'No attachments.',
      errors: {
        noPermission: 'You do not have permission to view this email.',
        notFound: 'Email not found.',
        failedToLoad: 'Failed to load email.',
      },
      admin: {
        currentSetup: 'Current setup',
        loadingModels: 'Loading models…',
        defaultModel: 'Default model',
        searchModels: 'Search models...',
        noModelsFound: 'No models found.',
        processing: 'Processing…',
        analyze: 'Test AI analysis',
        failedToAnalyze: 'Failed to analyze email.',
        analysisResult: 'AI analysis:',
        extractedMarkdown: 'Extracted markdown:',
        modelUsed: 'Model used:',
        reprocess: 'Re-process',
        failedToReprocess: 'Failed to reprocess email.',
        ruleApplied: 'Rule applied:',
        tokensUsed: 'Tokens used:',
        estCost: 'Est. cost:',
        processedBody: 'Processed body:',
      },
    },
    admin: {
      users: {
        rerunAnalysis: 'Re-run AI Analysis',
        rerunAnalysisTitle: 'Re-run AI analysis',
        rerunAnalysisDesc:
          'Delete all stored AI analysis for {email} and run it again on every email in this inbox? This can take a while.',
        rerunAnalysisPreparing: 'Preparing…',
        rerunAnalysisProgress: '{done} / {total} emails ({percent}%)',
        rerunAnalysisRetry: 'Retry',
        resetData: 'Reset Data',
        resetDataTitle: 'Reset user data',
        resetDataDesc:
          'Delete all stored data for {email} and provision a fresh Postino profile? The login stays active, but emails, rules, jobs, knowledge, and caches will be removed.',
      },
      toasts: {
        settingsSaved: 'Settings saved',
        failedToLoadStats: 'Failed to load stats',
        failedToLoadChartData: 'Failed to load chart data',
        userDeleted: 'User deleted',
        adminGranted: 'Admin privileges granted',
        adminRemoved: 'Admin privileges removed',
        userSuspended: 'User suspended',
        userActivated: 'User activated',
        userAnalysesRerun: 'AI analysis refreshed for {count} emails.',
        userAnalysesRerunPartial:
          'AI analysis refreshed for {done} emails, {failed} failed, {skipped} skipped.',
        failedToRerunUserAnalyses: 'Failed to re-run user AI analysis.',
        userDataReset: 'User data reset',
        failedToResetUserData: 'Failed to reset user data',
        failedToUpdateUser: 'Failed to update user',
        failedToProcessQueue: 'Failed to process queue batch',
        failedToUpdateMailgunSetting: 'Failed to update Mailgun webhook logging setting',
        failedToClearLogs: 'Failed to clear Mailgun webhook request logs',
      },
    },
  },

  // -------------------------------------------------------------------------
  // it – Italiano
  // -------------------------------------------------------------------------
  it: {
    nav: {
      signIn: 'Accedi',
      getStarted: 'Inizia',
      signOut: 'Esci',
      dashboard: 'Dashboard',
      admin: 'Admin',
      allRightsReserved: 'Tutti i diritti riservati.',
    },
    language: {
      select: 'Lingua',
    },
    home: {
      hero: {
        words: ['riassume', 'organizza', 'traduce', 'raffina'],
        emailsAndNewsletters: 'e-mail & newsletter',
        subtitle:
          "Ottieni un indirizzo email privato.\nScrivi semplici regole in linguaggio naturale.\nL'AI di Postino elabora le tue email in arrivo — riassumendo newsletter, rimuovendo annunci, estraendo informazioni chiave e molto altro — poi ti inoltra il risultato.",
        startFree: 'Inizia gratis',
        howItWorks: 'Come funziona',
      },
      howItWorks: {
        title: 'Come funziona',
        step1: {
          title: 'Ottieni il tuo indirizzo',
          desc: 'Registrati e ottieni un indirizzo email Postino unico come amber-2026@postino.pro',
        },
        step2: {
          title: 'Scrivi le tue regole',
          desc: 'Di\' a Postino cosa fare in italiano semplice: "Riassumi le newsletter", "Rimuovi i contenuti promozionali", ecc.',
        },
        step3: {
          title: 'Ricevi le email elaborate',
          desc: "Postino elabora le email in arrivo con l'AI e inoltra contenuti puliti e utili alla tua casella di posta.",
        },
      },
      exampleRules: {
        title: 'Esempi di regole',
        rules: [
          'Riassumi le newsletter e rimuovi tutti gli annunci e i contenuti promozionali',
          "Estrai ed elenca solo gli elementi d'azione importanti dalle email",
          'Traduci le email in italiano e riassumi i punti principali',
          "Per ricevute e conferme d'ordine, estrai solo i dettagli dell'ordine e il totale",
          'Rimuovi i pixel di tracciamento e riscrivi i link in modo pulito',
          "Se l'email è un'offerta promozionale, ignorala completamente",
        ],
      },
      blog: {
        title: 'Postino Blog',
        subtitle: 'Consigli, aggiornamenti e approfondimenti dal team di Postino',
        readMore: 'Leggi di più',
        backToBlog: 'Torna al Blog',
        cta: {
          title: 'Leggi il nostro Blog',
          subtitle: 'Scopri consigli, guide e aggiornamenti sulla gestione email con AI.',
          button: 'Esplora gli articoli',
        },
      },
    },
    auth: {
      login: {
        welcomeBack: 'Bentornato',
        signInToAccount: 'Accedi al tuo account',
        emailAddress: 'Indirizzo email',
        password: 'Password',
        forgotPassword: 'Password dimenticata?',
        signIn: 'Accedi',
        noAccount: 'Non hai un account?',
        signUp: 'Registrati',
        errors: {
          invalidCredential: 'Email o password non validi',
          tooManyRequests: 'Troppi tentativi falliti. Riprova più tardi.',
          failed: 'Accesso non riuscito. Riprova.',
          suspended: 'Il tuo account è stato sospeso. Contatta il supporto.',
          emailNotVerified: "Verifica il tuo indirizzo email prima di accedere.",
        },
      },
      register: {
        createAccount: 'Crea il tuo account',
        getYourAddress: 'Ottieni il tuo indirizzo Postino personale',
        emailAddress: 'Indirizzo email',
        password: 'Password',
        minChars: 'Min. 8 caratteri',
        confirmPassword: 'Conferma password',
        repeatPassword: 'Ripeti la password',
        alreadyHaveAccount: 'Hai già un account?',
        signIn: 'Accedi',
        button: 'Crea account',
        maintenanceMessage:
          'Stiamo migliorando il servizio. Le nuove registrazioni sono sospese durante la manutenzione. Riprova più tardi.',
        errors: {
          passwordsMismatch: 'Le password non coincidono',
          passwordTooShort: 'La password deve essere di almeno 8 caratteri',
          emailAlreadyInUse: 'Esiste già un account con questa email',
          weakPassword: 'La password è troppo debole',
          blockedDomain: 'Non puoi creare un account con i nostri indirizzi email',
          failed: 'Creazione account non riuscita. Riprova.',
        },
      },
      forgotPassword: {
        title: 'Reimposta la password',
        subtitle: 'Inserisci la tua email per ricevere un link di reimpostazione',
        emailAddress: 'Indirizzo email',
        sendResetLink: 'Invia link di reimpostazione',
        rememberedPassword: 'Ricordi la password?',
        backToSignIn: "Torna all'accesso",
        successMessage:
          'Se esiste un account per questa email, ti abbiamo inviato un link per reimpostare la password.',
        errors: {
          invalidEmail: 'Indirizzo email non valido',
          tooManyAttempts: 'Troppi tentativi. Riprova più tardi.',
          failed: 'Invio email di reimpostazione non riuscito. Riprova.',
        },
      },
      dashboardLink: {
        alreadySignedIn: "Hai già effettuato l'accesso.",
        goToDashboard: 'Vai alla Dashboard',
        loadingDashboard: 'Caricamento dashboard…',
      },
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Gestisci il tuo indirizzo Postino e le regole email',
      tabs: {
        overview: 'Panoramica',
        myRules: 'Le mie regole',
        emailHistory: 'Cronologia email',
        inbox: 'In arrivo',
        explore: 'Esplora',
        relations: 'Relazioni',
        settings: 'Impostazioni',
        agent: 'Memoria',
      },
      address: {
        title: 'Il tuo indirizzo Postino',
        active: 'Attivo',
        disabled: 'Disabilitato',
        activeDescription:
          'Invia email a questo indirizzo e verranno elaborate secondo le tue regole, poi inoltrate alla tua email',
        disabledDescription:
          'Il tuo indirizzo Postino è disabilitato. Le email in arrivo verranno registrate come saltate e non inoltrate.',
        copy: 'Copia',
        copied: 'Copiato',
        toggleAriaLabel: 'Abilita o disabilita il tuo indirizzo Postino',
        aiAnalysisOnly: 'Solo analisi AI',
        aiAnalysisOnlyEnabledDescription:
          "Le email in arrivo vengono analizzate dall'AI e salvate in memoria, ma le regole e l'inoltro vengono saltati.",
        aiAnalysisOnlyDisabledDescription:
          "Attiva per analizzare le email con l'AI e aggiornare la memoria anche quando l'inoltro è disabilitato.",
        aiAnalysisOnlyToggleAriaLabel: 'Abilita o disabilita la modalità solo analisi AI',
      },
      stats: {
        emailsReceived: 'Email ricevute',
        emailsForwarded: 'Email inoltrate',
        emailsErrored: 'Email con errori',
        emailsSkipped: 'Email saltate',
        tokensUsed: 'Token usati',
        estCost: 'Costo stimato',
        period: 'Periodo',
        last24h: 'Ultime 24h',
        last7days: 'Ultimi 7 giorni',
        lastMonth: 'Ultimo mese',
        allTime: 'Tutto',
      },
      pushNotifications: {
        title: 'Notifiche push',
        enabledDescription:
          "Riceverai una notifica del browser ogni volta che un'email viene elaborata.",
        disabledDescription:
          'Attiva per ricevere una notifica del browser ogni volta che una nuova email viene elaborata.',
        blockedDescription:
          'Le notifiche sono bloccate dal browser. Apri le impostazioni del sito nel browser e consenti le notifiche per abilitare questa funzione.',
      },
      forwardingHeader: {
        title: 'Intestazione Postino nelle email inoltrate',
        enabledDescription:
          'Un riquadro di riepilogo Postino viene aggiunto in fondo a ogni email inoltrata.',
        disabledDescription:
          'Il riquadro di riepilogo Postino non viene aggiunto alle email inoltrate.',
      },
      analysisLanguage: {
        title: 'Lingua analisi AI',
        description:
          'Scegli la lingua per i contenuti generati dall\'AI (riepilogo, intento, tag, argomenti). Seleziona "Auto" per usare l\'inglese (predefinito).',
        selectPlaceholder: 'Seleziona lingua',
        autoLabel: 'Auto (Inglese)',
      },
      installApp: {
        title: "Installa l'app Postino",
        description:
          "Installa Postino come app sul tuo dispositivo per un'esperienza più rapida e nativa.",
        buttonLabel: 'Installa app',
        alreadyInstalled: 'Già installata',
      },
      deleteEntities: {
        title: 'Elimina tutte le entità e le unioni',
        description:
          'Elimina definitivamente tutte le entità estratte (persone, argomenti, organizzazioni, luoghi, eventi, tag) dalle tue email, tutte le unioni di entità e tutti i suggerimenti di unione AI. Questa azione non può essere annullata.',
        buttonLabel: 'Elimina tutte le entità e le unioni',
        confirmTitle: 'Eliminare tutte le entità e le unioni?',
        confirmDescription:
          'Questa azione eliminerà definitivamente tutte le entità estratte dalle tue email, le unioni e i suggerimenti di unione AI. Questa azione non può essere annullata.',
        cancel: 'Annulla',
        confirmButton: 'Elimina tutto',
        successToast: 'Tutti i dati delle entità eliminati.',
        errorToast: 'Eliminazione dei dati delle entità non riuscita.',
      },
      clearAnalysis: {
        title: "Elimina tutta l'analisi AI",
        description:
          "Rimuovi tutta l'analisi AI generata, i contenuti elaborati, l'uso di token e i dati di costo dalle tue email. Vengono conservati solo i messaggi originali. Elimina anche tutte le entità, le unioni e i grafi in cache. Questa azione non può essere annullata.",
        buttonLabel: "Elimina tutta l'analisi AI",
        confirmTitle: "Eliminare tutta l'analisi AI?",
        confirmDescription:
          "Questa azione rimuoverà definitivamente tutta l'analisi AI, i contenuti elaborati, l'uso di token, le entità, le unioni e i grafi in cache dalle tue email. Vengono conservati solo i messaggi originali. Questa azione non può essere annullata.",
        cancel: 'Annulla',
        confirmButton: "Elimina tutta l'analisi",
        successToast: 'Tutti i dati di analisi AI eliminati.',
        errorToast: 'Eliminazione dei dati di analisi AI non riuscita.',
      },
      resetUsageStats: {
        title: 'Reimposta statistiche costi e token',
        description:
          'Riporta a zero tutti i valori salvati di token e costo stimato nelle tue email elaborate. Le email non verranno eliminate.',
        buttonLabel: 'Reimposta statistiche costi e token',
        confirmTitle: 'Reimpostare le statistiche di costi e token?',
        confirmDescription:
          'Questa azione riporterà a zero tutti i valori salvati di token e costo stimato per le tue email elaborate. Questa azione non può essere annullata.',
        cancel: 'Annulla',
        confirmButton: 'Reimposta statistiche',
        successToast: 'Statistiche di costi e token reimpostate.',
        errorToast: 'Reimpostazione delle statistiche di costi e token non riuscita.',
      },
      clearMemories: {
        title: 'Elimina tutte le memorie',
        description:
          'Elimina definitivamente tutte le memorie utente salvate, inclusa la cronologia locale e i dati Supermemory quando configurati. Questa azione non può essere annullata.',
        buttonLabel: 'Elimina tutte le memorie',
        confirmTitle: 'Eliminare tutte le memorie?',
        confirmDescription:
          'Questa azione eliminerà definitivamente tutte le tue memorie salvate. Questa azione non può essere annullata.',
        cancel: 'Annulla',
        confirmButton: 'Elimina memorie',
        successToast: 'Tutte le memorie eliminate.',
        errorToast: 'Eliminazione delle memorie non riuscita.',
      },
      charts: {
        myEmailVolume: 'Il mio volume di email',
        received: 'Ricevute',
        processing: 'In elaborazione',
        forwarded: 'Inoltrate',
        error: 'Errore',
        skipped: 'Saltate',
        estimatedCost: 'Costo stimato',
        estCost: 'Costo stimato',
        last24h: 'Ultime 24h',
        last7days: 'Ultimi 7 giorni',
        last30days: 'Ultimi 30 giorni',
        perHour: "All'ora",
        perDay: 'Al giorno',
        perWeek: 'Alla settimana',
        weekOf: 'Settimana del',
      },
      emailHistory: {
        allStatuses: 'Tutti gli stati',
        filterByStatus: 'Filtra per stato',
        refresh: 'Aggiorna',
        showPostinoHeader: 'Mostra intestazione Postino nelle email inoltrate',
        noEmailsWithStatus: 'Nessuna email con stato',
        clearFilter: 'Rimuovi filtri',
        noEmailsYet: 'Nessuna email elaborata.',
        noEmailsYetDesc: "Invia un'email al tuo indirizzo Postino per iniziare!",
        selectEmailToRead: "Seleziona un'email da leggere",
        from: 'Da:',
        to: 'A:',
        cc: 'Cc:',
        bcc: 'Bcc:',
        attachments: 'Allegati:',
        downloadAttachment: 'Scarica allegato',
        noAttachmentsShort: 'Nessuno',
        ruleApplied: 'Regola applicata:',
        tokens: 'Token:',
        viewOriginal: 'Visualizza email originale',
        viewFullPage: 'Pagina intera',
        loadingEmail: 'Caricamento email…',
        searchPlaceholder: 'Cerca email…',
        withAttachments: 'Con allegati',
        applyFilters: 'Cerca',
        results: 'risultati',
        messages: 'messaggi',
        previous: 'Precedente',
        next: 'Successivo',
        page: 'Pagina',
        of: 'di',
        aiAnalysis: 'Analisi AI',
        tabSummary: 'Dettagli',
        tabContent: 'Contenuto',
        tabAiAnalysis: 'AI',
        noAiAnalysis: 'Nessuna analisi AI disponibile.',
        analysisType: 'Tipo:',
        analysisSentiment: 'Sentiment:',
        analysisPriority: 'Priorità:',
        analysisLanguage: 'Lingua:',
        analysisSenderType: 'Tipo mittente:',
        analysisIntent: 'Intenzione:',
        analysisTags: 'Tag:',
        analysisTopics: 'Argomenti:',
        analysisRequiresResponse: 'Richiede risposta',
        analysisEntitiesPeople: 'Persone:',
        analysisEntitiesOrganizations: 'Organizzazioni:',
        analysisEntitiesPlaces: 'Luoghi:',
        analysisEntitiesEvents: 'Eventi:',
        analysisEntitiesDates: 'Date:',
        analysisEntitiesPrices: 'Prezzi:',
        rerunAnalysis: 'Ripeti analisi',
        rerunningAnalysis: 'Analisi in aggiornamento...',
        deleteEmail: 'Elimina email',
        deleteEmailConfirm:
          'Sei sicuro di voler eliminare definitivamente questa email? Questa azione non può essere annullata.',
        deleteEmailSuccess: 'Email eliminata.',
        deleteEmailError: "Impossibile eliminare l'email.",
        failedToLoad: 'Caricamento email non riuscito',
        failedToLoadCount: 'Caricamento conteggio email non riuscito',
      },
      search: {
        title: 'Cerca email',
        toggleFilters: 'Mostra/nascondi filtri',
        searchPlaceholder: 'Cerca per oggetto, mittente, riepilogo, tag…',
        applyFilters: 'Cerca',
        noResults: 'Nessuna email corrisponde ai filtri.',
        filterStatus: 'Stato',
        filterSentiment: 'Sentiment',
        filterCategory: 'Categoria',
        filterPriority: 'Priorità',
        filterSenderType: 'Tipo mittente',
        filterLanguage: 'Lingua',
        filterTags: 'Tag',
        filterPeople: 'Persone',
        filterOrgs: 'Organizzazioni',
        filterPlaces: 'Luoghi',
        filterEvents: 'Eventi',
        filterNumbers: 'Numeri e codici',
        languagePlaceholder: 'Seleziona lingua…',
        tagsPlaceholder: 'Seleziona tag…',
        peoplePlaceholder: 'Seleziona persone…',
        orgsPlaceholder: 'Seleziona organizzazioni…',
        placesPlaceholder: 'Seleziona luoghi…',
        eventsPlaceholder: 'Seleziona eventi…',
        numbersPlaceholder: 'Seleziona numeri/codici…',
        advancedFilters: 'Filtri avanzati',
        withAttachments: 'Con allegati',
        requiresResponse: 'Richiede risposta',
        hasActionItems: 'Ha azioni da fare',
        isUrgent: 'Urgente',
        allSentiments: 'Tutti i sentiment',
        sentimentPositive: 'Positivo',
        sentimentNeutral: 'Neutro',
        sentimentNegative: 'Negativo',
        allCategories: 'Tutte le categorie',
        typeNewsletter: 'Newsletter',
        typeTransactional: 'Transazionale',
        typePromotional: 'Promozionale',
        typePersonal: 'Personale',
        typeNotification: 'Notifica',
        typeAutomated: 'Automatizzato',
        typeOther: 'Altro',
        allPriorities: 'Tutte le priorità',
        priorityLow: 'Bassa',
        priorityNormal: 'Normale',
        priorityHigh: 'Alta',
        priorityCritical: 'Critica',
        allSenderTypes: 'Tutti i tipi',
        senderHuman: 'Persona',
        senderAutomated: 'Automatizzato',
        senderBusiness: 'Azienda',
        senderNewsletter: 'Newsletter',
      },
      knowledge: {
        title: 'Esplora email',
        subtitle: 'Esplora argomenti, persone e organizzazioni dalle tue email',
        allCategories: 'Tutti',
        topics: 'Argomenti',
        people: 'Persone',
        organizations: 'Organizzazioni',
        places: 'Luoghi',
        events: 'Eventi',
        tags: 'Tag',
        numbers: 'Numeri e codici',
        emailsAnalyzed: '{count} email analizzate',
        noData: 'Nessun dato disponibile',
        noDataDesc:
          'Invia alcune email al tuo indirizzo Postino per iniziare a costruire il grafo della conoscenza.',
        searchInInbox: 'Cerca nella posta',
        loading: 'Caricamento…',
        mentions: 'menzioni',
        relatedEmails: 'Email correlate',
        relatedEmailsDesc: 'Email che menzionano',
        noRelatedEmails: 'Nessuna email trovata per questo termine.',
        merge: 'Unisci',
        mergeMode: 'Seleziona per unire',
        cancelMerge: 'Annulla',
        mergeSelected: 'Unisci selezionati',
        mergeDialogTitle: 'Unisci entità',
        mergeDialogDesc: 'Queste entità verranno combinate in una sola.',
        canonicalName: 'Nome canonico',
        canonicalNamePlaceholder: 'Nome da visualizzare',
        mergeChipHint: 'Clicca su un nome per usarlo come nome canonico',
        createMerge: 'Crea unione',
        mergeSameCategoryWarning: 'Seleziona 2 o più entità della stessa categoria per unirle.',
        manageMerges: 'Gestisci unioni',
        noMerges: 'Nessuna unione definita.',
        deleteMerge: 'Elimina unione',
        deleteConfirm: 'Sei sicuro di voler eliminare',
        mergesTitle: 'Unioni di entità',
        mergesDesc:
          'Le entità unite vengono mostrate come un unico elemento nella vista conoscenza.',
        listTab: 'Lista',
        mergedTab: 'Uniti',
        suggestionsTab: 'Suggerimenti',
        xSelected: '{count} selezionati',
        mergedFrom: 'Unito da',
        mergeCreated: 'Unione creata',
        mergeDeleted: 'Unione eliminata',
        cannotBeUndone: 'Questa azione non può essere annullata.',
        suggestionsAskAI: "Chiedi suggerimenti all'IA",
        suggestionsAskAIDesc: "L'IA analizzerà le tue entità e suggerirà possibili unioni.",
        suggestionsGenerating: 'Generazione suggerimenti…',
        suggestionsEmpty: 'Nessun suggerimento',
        suggestionsEmptyDesc: "Clicca il pulsante per chiedere all'IA di suggerire unioni.",
        suggestionsAccept: 'Accetta',
        suggestionsReject: 'Rifiuta',
        suggestionsCompleteFirst: 'Completa tutti i suggerimenti prima di generarne di nuovi.',
        suggestionsError: 'Generazione suggerimenti non riuscita. Riprova.',
        failedToLoad: 'Caricamento dati non riuscito',
        failedToLoadMerges: 'Caricamento unioni non riuscito',
        failedToLoadSuggestions: 'Caricamento suggerimenti non riuscito',
        suggestionsGenerated: 'Suggerimenti generati',
        relations: {
          viewToggle: 'Mappa relazioni',
          exploreToggle: 'Esplora',
          title: 'Mappa relazioni',
          subtitle: 'Connessioni tra entità scoperte nelle tue email',
          generate: 'Genera relazioni',
          generating: 'Generazione…',
          regenerate: 'Rigenera',
          noGraph: 'Nessuna mappa relazioni',
          noGraphDesc:
            'Clicca "Genera relazioni" per scoprire le connessioni tra le entità nelle tue email.',
          generatedOn: 'Generata il {date}',
          totalEmails: 'Basato su {count} email',
          error: 'Generazione relazioni non riuscita',
          nodeClickHint: 'Seleziona un nodo per evidenziare le connessioni',
          nodeClickHint2: 'Usa il pulsante per esplorare le email correlate',
          openRelatedEmails: 'Apri email correlate',
          expandFullPage: 'Pagina intera',
          closeFullPage: 'Chiudi',
          legend: 'Legenda',
          loadError: 'Caricamento mappa relazioni non riuscito',
          generated: 'Grafico relazioni aggiornato',
          graphTab: 'Grafico',
          flowTab: 'Flusso',
          mapTab: 'Mappa',
          flowNodeClick:
            'Clicca una volta per evidenziare le entità collegate, poi usa il pulsante per esplorare le email correlate',
          flowGenerate: 'Genera flusso',
          flowGenerating: 'Generazione…',
          flowRegenerate: 'Rigenera flusso',
          flowNoGraph: 'Nessun diagramma di flusso',
          flowNoGraphDesc:
            'Clicca "Genera flusso" per visualizzare come le entità si sono evolute nel tempo.',
          flowError: 'Generazione del diagramma di flusso non riuscita',
          flowLoadError: 'Caricamento del diagramma di flusso non riuscito',
          flowGenerated: 'Diagramma di flusso aggiornato',
          flowGeneratedOn: 'Generato il {date}',
          flowTotalEmails: 'Basato su {count} email',
          mapPinClick:
            'Clicca un pin per selezionare un luogo, poi usa il pulsante per esplorare le email correlate',
          mapGenerate: 'Genera mappa',
          mapRegenerate: 'Rigenera mappa',
          mapNoGraph: 'Nessuna mappa luoghi',
          mapNoGraphDesc:
            'Clicca "Genera mappa" per posizionare su una mappa reale i luoghi menzionati nelle tue email.',
          mapError: 'Generazione della mappa luoghi non riuscita',
          mapLoadError: 'Caricamento della mappa luoghi non riuscito',
          mapGenerated: 'Mappa luoghi aggiornata',
          mapGeneratedOn: 'Generata il {date}',
          mapTotalEmails: 'Basata su {count} email',
        },
      },
      rules: {
        yourRules: 'Le tue regole',
        active: 'Attiva',
        disabled: 'Disabilitata',
        appliedTopToBottom: "Le regole vengono applicate dall'alto verso il basso.",
        useArrows: "Usa le frecce per cambiare l'ordine.",
        addARule: 'Crea regola',
        newRule: 'Nuova regola',
        ruleName: 'Nome regola',
        ruleDescription: 'Descrizione regola',
        hideFilters: 'Nascondi filtri',
        addFilters: 'Aggiungi filtri mittente/oggetto/corpo (opzionale)',
        editFilters: 'Modifica filtri mittente/oggetto/corpo (opzionale)',
        filterHelp:
          "Applica questa regola solo quando l'email corrisponde a tutti i pattern forniti (contiene, senza distinzione maiuscole/minuscole). Lascia vuoto per applicare a tutte le email.",
        senderContains: 'Mittente contiene',
        subjectContains: 'Oggetto contiene',
        bodyContains: 'Corpo contiene',
        ruleNamePlaceholder: 'es. Riepilogo newsletter',
        ruleDescriptionPlaceholder:
          'Esempio: Riassumi le newsletter e rimuovi i contenuti promozionali. Mantieni solo gli articoli e i link principali.',
        senderPlaceholder: 'es. newsletter@esempio.com',
        subjectPlaceholder: 'es. Digest settimanale',
        bodyPlaceholder: 'es. annulla iscrizione',
        addRule: 'Aggiungi regola',
        cancel: 'Annulla',
        saveChanges: 'Salva modifiche',
        noRulesYet: 'Nessuna regola. Aggiungi la tua prima regola sopra!',
        exampleRule: 'Esempio: "Rimuovi annunci e riassumi le newsletter"',
        sender: 'Mittente:',
        subject: 'Oggetto:',
        body: 'Corpo:',
        updated: 'Aggiornato',
        moveRuleUp: 'Sposta regola su',
        moveRuleDown: 'Sposta regola giù',
        processingOrder: 'Ordine di elaborazione',
        edit: 'Modifica',
        delete: 'Elimina',
        deleteRule: 'Elimina regola',
        deleteConfirm: 'Sei sicuro di voler eliminare',
        cannotBeUndone: 'Questa azione non può essere annullata.',
        close: 'Chiudi',
        searchPlaceholder: 'Cerca regole…',
        noMatchingRules: 'Nessuna regola corrisponde alla ricerca.',
        ruleCreated: 'Regola creata',
        ruleSaved: 'Regola salvata',
        ruleEnabled: 'Regola attivata',
        ruleDisabled: 'Regola disattivata',
        ruleDeleted: 'Regola eliminata',
        errors: {
          nameRequired: 'Il nome della regola è obbligatorio',
          textRequired: 'Il testo della regola è obbligatorio',
          nameTooLong: 'Il nome della regola deve essere al massimo {max} caratteri',
          textTooLong: 'La regola supera la lunghezza massima di {max} caratteri',
          failedToCreate: 'Creazione regola non riuscita',
          failedToUpdate: 'Aggiornamento regola non riuscito',
          failedToDelete: 'Eliminazione regola non riuscita',
          failedToReorder: 'Riordinamento regole non riuscito',
        },
      },
      pwaInstall: {
        title: 'Aggiungi Postino alla schermata home',
        description:
          "Ottieni un accesso più rapido e un'esperienza migliore installando l'app sul tuo dispositivo.",
        howToTitle: 'Come installare:',
        iosSafariStep1Pre: 'Tocca il',
        iosSafariStep1Post: 'pulsante Condividi nella barra del browser.',
        iosSafariStep2Pre: 'Tocca',
        iosSafariStep2Bold: 'Aggiungi a schermata Home',
        iosSafariStep3: "Tocca Aggiungi nell'angolo in alto a destra per confermare.",
        iosSafari26Step1Pre: 'Tocca il',
        iosSafari26Step1Post: 'pulsante nella barra del browser.',
        iosSafari26Step2Pre: 'Tocca',
        iosSafari26Step2Bold: 'Condividi',
        iosSafari26Step2Post: 'nel menu.',
        iosSafari26Step3Pre: 'Tocca',
        iosSafari26Step3Bold: 'Altro',
        iosSafari26Step4Pre: 'Seleziona',
        iosSafari26Step4Bold: 'Aggiungi a schermata Home',
        iosSafari26Step4Post: 'dal menu. Potrebbe essere necessario scorrere verso il basso.',
        iosSafari26iPadStep1Pre: 'Tocca il',
        iosSafari26iPadStep1Post: 'pulsante Condividi nella barra del browser.',
        iosChromeStep1Pre: 'Tocca il',
        iosChromeStep1Post: "pulsante nell'angolo in alto a destra.",
        iosChromeStep2Pre: 'Seleziona',
        iosChromeStep2Bold: 'Aggiungi a schermata Home',
        iosChromeStep2Post:
          ' dal menu. Potrebbe essere necessario scorrere verso il basso per trovarlo.',
        iosChromeStep3: 'Tocca Aggiungi per confermare.',
        androidStep1Pre: 'Tocca il',
        androidStep1Post: "pulsante menu nell'angolo in alto a destra.",
        androidStep2Pre: 'Tocca',
        androidStep2Bold: 'Aggiungi alla schermata Home',
        androidStep3: 'Tocca Aggiungi per confermare.',
        installButton: 'Installa app',
        notNow: 'Non ora',
      },
      toasts: {
        settingSaved: 'Impostazione salvata',
        failedToLoadStats: 'Caricamento statistiche non riuscito',
        failedToUpdateEmailSetting: 'Aggiornamento indirizzo email non riuscito',
        failedToUpdateForwardingHeaderSetting: 'Aggiornamento intestazione inoltro non riuscito',
        failedToUpdateAiAnalysisOnlySetting:
          'Aggiornamento impostazione solo analisi AI non riuscito',
        failedToUpdateAnalysisLanguageSetting: 'Aggiornamento lingua di analisi non riuscito',
        analysisRefreshed: 'Analisi AI aggiornata.',
        analysisRefreshFailed: "Aggiornamento dell'analisi AI non riuscito.",
        downloadAttachmentFailed: "Impossibile scaricare l'allegato.",
      },
      agent: {
        title: 'Agente di Memoria',
        subtitle: 'Chiedimi delle tue email.',
        placeholder: 'Chiedi qualcosa come "Quali newsletter ho ricevuto questa settimana?"',
        inputPlaceholder: 'Chiedi delle tue email…',
        send: 'Invia',
        noAnswer: 'Nessuna risposta trovata.',
        errorFallback: 'Qualcosa è andato storto. Riprova.',
        sendHint: "L'AI può fare errori, verifica sempre.",
        clearConversation: 'Cancella conversazione',
        clearConfirmTitle: 'Cancellare la conversazione?',
        clearConfirmDescription:
          'Questo rimuoverà tutti i messaggi della sessione corrente. Questa azione non può essere annullata.',
        clearConfirmButton: 'Cancella',
        cancelClear: 'Annulla',
        expandFullPage: 'Pagina intera',
        closeFullPage: 'Chiudi',
        sourceEmails: 'Email di riferimento',
        cta: {
          title: 'Il tuo agente AI è pronto',
          description: 'Chiedimi delle tue email.',
          button: 'Chiedimi tutto sulle tue email!',
        },
      },
    },
    emailOriginal: {
      back: 'Indietro',
      originalEmail: 'Email originale',
      from: 'Da:',
      to: 'A:',
      cc: 'Cc:',
      bcc: 'Bcc:',
      subject: 'Oggetto:',
      received: 'Ricevuta:',
      emailContent: 'Contenuto email',
      openFullPageView: 'Pagina intera',
      openFullPageViewAria: 'Apri email a pagina intera',
      noOriginalContent: 'Nessun contenuto originale salvato.',
      closeFullPageView: 'Chiudi vista a pagina intera',
      attachments: 'Allegati:',
      noAttachments: 'Nessun allegato.',
      errors: {
        noPermission: 'Non hai i permessi per visualizzare questa email.',
        notFound: 'Email non trovata.',
        failedToLoad: "Impossibile caricare l'email.",
      },
      admin: {
        currentSetup: 'Configurazione attuale',
        loadingModels: 'Caricamento modelli…',
        defaultModel: 'Modello predefinito',
        searchModels: 'Cerca modelli...',
        noModelsFound: 'Nessun modello trovato.',
        processing: 'Elaborazione…',
        analyze: 'Test analisi AI',
        failedToAnalyze: "Impossibile analizzare l'email.",
        analysisResult: 'Analisi AI:',
        extractedMarkdown: 'Markdown estratto:',
        modelUsed: 'Modello usato:',
        reprocess: 'Rielabora',
        failedToReprocess: "Impossibile rielaborare l'email.",
        ruleApplied: 'Regola applicata:',
        tokensUsed: 'Token usati:',
        estCost: 'Costo est.:',
        processedBody: 'Corpo elaborato:',
      },
    },
    admin: {
      users: {
        rerunAnalysis: 'Rilancia analisi AI',
        rerunAnalysisTitle: 'Rilancia analisi AI',
        rerunAnalysisDesc:
          "Eliminare tutte le analisi AI salvate per {email} e rieseguirle su ogni email di questa inbox? Potrebbe richiedere un po' di tempo.",
        rerunAnalysisPreparing: 'Preparazione…',
        rerunAnalysisProgress: '{done} / {total} email ({percent}%)',
        rerunAnalysisRetry: 'Riprova',
        resetData: 'Reimposta dati',
        resetDataTitle: 'Reimposta dati utente',
        resetDataDesc:
          "Eliminare tutti i dati salvati per {email} e creare un nuovo profilo Postino? L'accesso resta attivo, ma email, regole, job, knowledge e cache verranno rimossi.",
      },
      toasts: {
        settingsSaved: 'Impostazioni salvate',
        failedToLoadStats: 'Caricamento statistiche non riuscito',
        failedToLoadChartData: 'Caricamento dati grafico non riuscito',
        userDeleted: 'Utente eliminato',
        adminGranted: 'Privilegi admin concessi',
        adminRemoved: 'Privilegi admin rimossi',
        userSuspended: 'Utente sospeso',
        userActivated: 'Utente attivato',
        userAnalysesRerun: 'Analisi AI aggiornata per {count} email.',
        userAnalysesRerunPartial:
          'Analisi AI aggiornata per {done} email, {failed} fallite, {skipped} saltate.',
        failedToRerunUserAnalyses: "Riesecuzione dell'analisi AI utente non riuscita.",
        userDataReset: 'Dati utente reimpostati',
        failedToResetUserData: 'Reimpostazione dati utente non riuscita',
        failedToUpdateUser: 'Aggiornamento utente non riuscito',
        failedToProcessQueue: 'Elaborazione batch non riuscita',
        failedToUpdateMailgunSetting: 'Aggiornamento impostazione Mailgun non riuscito',
        failedToClearLogs: 'Cancellazione log non riuscita',
      },
    },
  },
  es: {
    nav: {
      signIn: 'Iniciar sesión',
      getStarted: 'Empezar',
      signOut: 'Cerrar sesión',
      dashboard: 'Panel',
      admin: 'Admin',
      allRightsReserved: 'Todos los derechos reservados.',
    },
    language: {
      select: 'Idioma',
    },
    home: {
      hero: {
        words: ['resume', 'organiza', 'traduce', 'mejora'],
        emailsAndNewsletters: 'correos & boletines',
        subtitle:
          'Obtén una dirección de correo privada.\nEscribe reglas simples en lenguaje natural.\nLa IA de Postino procesa tus correos entrantes — resumiendo boletines, eliminando anuncios, extrayendo información clave y mucho más — luego te reenvía el resultado.',
        startFree: 'Empezar gratis',
        howItWorks: 'Cómo funciona',
      },
      howItWorks: {
        title: 'Cómo funciona',
        step1: {
          title: 'Obtén tu dirección',
          desc: 'Regístrate y obtén una dirección de correo Postino única como amber-2026@postino.pro',
        },
        step2: {
          title: 'Escribe tus reglas',
          desc: 'Dile a Postino qué hacer en español simple: "Resume los boletines", "Elimina contenido promocional", etc.',
        },
        step3: {
          title: 'Recibe correos procesados',
          desc: 'Postino procesa los correos entrantes con IA y reenvía contenido limpio y útil a tu bandeja de entrada.',
        },
      },
      exampleRules: {
        title: 'Reglas de ejemplo',
        rules: [
          'Resumir boletines y eliminar todos los anuncios y contenido promocional',
          'Extraer y listar solo los elementos de acción importantes de los correos',
          'Traducir correos al español y resumir los puntos principales',
          'Para recibos y confirmaciones de pedidos, extraer solo los detalles del pedido y el total',
          'Eliminar píxeles de seguimiento y reescribir los enlaces de forma limpia',
          'Si el correo es una oferta promocional, ignorarlo completamente',
        ],
      },
      blog: {
        title: 'Postino Blog',
        subtitle: 'Consejos, actualizaciones e información del equipo de Postino',
        readMore: 'Leer más',
        backToBlog: 'Volver al Blog',
        cta: {
          title: 'Lee nuestro Blog',
          subtitle:
            'Descubre consejos, guías y actualizaciones sobre la gestión de correos con IA.',
          button: 'Explorar artículos',
        },
      },
    },
    auth: {
      login: {
        welcomeBack: 'Bienvenido de nuevo',
        signInToAccount: 'Inicia sesión en tu cuenta',
        emailAddress: 'Correo electrónico',
        password: 'Contraseña',
        forgotPassword: '¿Olvidaste tu contraseña?',
        signIn: 'Iniciar sesión',
        noAccount: '¿No tienes una cuenta?',
        signUp: 'Registrarse',
        errors: {
          invalidCredential: 'Correo o contraseña inválidos',
          tooManyRequests: 'Demasiados intentos fallidos. Por favor, inténtalo más tarde.',
          failed: 'Error al iniciar sesión. Por favor, inténtalo de nuevo.',
          suspended: 'Tu cuenta ha sido suspendida. Por favor, contacta con el soporte.',
          emailNotVerified: 'Por favor, verifica tu dirección de correo electrónico antes de iniciar sesión.',
        },
      },
      register: {
        createAccount: 'Crea tu cuenta',
        getYourAddress: 'Obtén tu dirección personal de Postino',
        emailAddress: 'Correo electrónico',
        password: 'Contraseña',
        minChars: 'Mín. 8 caracteres',
        confirmPassword: 'Confirmar contraseña',
        repeatPassword: 'Repetir contraseña',
        alreadyHaveAccount: '¿Ya tienes una cuenta?',
        signIn: 'Iniciar sesión',
        button: 'Crear cuenta',
        maintenanceMessage:
          'Estamos mejorando el servicio. Los nuevos registros están suspendidos durante el mantenimiento. Por favor, inténtalo más tarde.',
        errors: {
          passwordsMismatch: 'Las contraseñas no coinciden',
          passwordTooShort: 'La contraseña debe tener al menos 8 caracteres',
          emailAlreadyInUse: 'Ya existe una cuenta con este correo',
          weakPassword: 'La contraseña es demasiado débil',
          blockedDomain: 'No puedes crear una cuenta con nuestras direcciones de correo',
          failed: 'Error al crear la cuenta. Por favor, inténtalo de nuevo.',
        },
      },
      forgotPassword: {
        title: 'Restablecer contraseña',
        subtitle: 'Ingresa tu correo para recibir un enlace de restablecimiento',
        emailAddress: 'Correo electrónico',
        sendResetLink: 'Enviar enlace de restablecimiento',
        rememberedPassword: '¿Recuerdas tu contraseña?',
        backToSignIn: 'Volver a iniciar sesión',
        successMessage:
          'Si existe una cuenta para este correo, te hemos enviado un enlace para restablecer la contraseña.',
        errors: {
          invalidEmail: 'Dirección de correo inválida',
          tooManyAttempts: 'Demasiados intentos. Por favor, inténtalo más tarde.',
          failed: 'Error al enviar el correo de restablecimiento. Por favor, inténtalo de nuevo.',
        },
      },
      dashboardLink: {
        alreadySignedIn: 'Ya has iniciado sesión.',
        goToDashboard: 'Ir al Panel',
        loadingDashboard: 'Cargando panel…',
      },
    },
    dashboard: {
      title: 'Panel',
      subtitle: 'Administra tu dirección Postino y las reglas de correo',
      tabs: {
        overview: 'Resumen',
        myRules: 'Mis Reglas',
        emailHistory: 'Historial de correos',
        inbox: 'Bandeja de entrada',
        explore: 'Explorar',
        relations: 'Relaciones',
        settings: 'Configuración',
        agent: 'Memoria',
      },
      address: {
        title: 'Tu dirección Postino',
        active: 'Activa',
        disabled: 'Desactivada',
        activeDescription:
          'Envía correos a esta dirección y se procesarán según tus reglas, luego se reenviarán a tu correo',
        disabledDescription:
          'Tu dirección Postino está desactivada. Los correos entrantes se registrarán como omitidos y no se reenviarán.',
        copy: 'Copiar',
        copied: 'Copiado',
        toggleAriaLabel: 'Habilitar o deshabilitar tu dirección Postino',
        aiAnalysisOnly: 'Solo análisis IA',
        aiAnalysisOnlyEnabledDescription:
          'Los correos entrantes son analizados por IA y guardados en memoria, pero se omiten las reglas y el reenvío.',
        aiAnalysisOnlyDisabledDescription:
          'Activa para analizar correos con IA y actualizar la memoria aunque el reenvío esté desactivado.',
        aiAnalysisOnlyToggleAriaLabel: 'Activar o desactivar el modo solo análisis IA',
      },
      stats: {
        emailsReceived: 'Correos recibidos',
        emailsForwarded: 'Correos reenviados',
        emailsErrored: 'Correos con error',
        emailsSkipped: 'Correos omitidos',
        tokensUsed: 'Tokens usados',
        estCost: 'Coste est.',
        period: 'Período',
        last24h: 'Últimas 24h',
        last7days: 'Últimos 7 días',
        lastMonth: 'Último mes',
        allTime: 'Todo',
      },
      pushNotifications: {
        title: 'Notificaciones push',
        enabledDescription:
          'Recibirás una notificación del navegador cada vez que se procese un correo.',
        disabledDescription:
          'Activa para recibir una notificación del navegador cada vez que se procese un nuevo correo.',
        blockedDescription:
          'Las notificaciones están bloqueadas por tu navegador. Abre la configuración del sitio en tu navegador y permite las notificaciones para habilitar esta función.',
      },
      forwardingHeader: {
        title: 'Encabezado Postino en correos reenviados',
        enabledDescription:
          'Un cuadro de resumen de Postino se añade al final de cada correo reenviado.',
        disabledDescription:
          'El cuadro de resumen de Postino no se añade a los correos reenviados.',
      },
      analysisLanguage: {
        title: 'Idioma del análisis IA',
        description:
          'Elige el idioma para el contenido generado por IA (resumen, intención, etiquetas, temas). Selecciona "Auto" para usar inglés (predeterminado).',
        selectPlaceholder: 'Seleccionar idioma',
        autoLabel: 'Auto (Inglés)',
      },
      installApp: {
        title: 'Instalar la app Postino',
        description:
          'Instala Postino como una app en tu dispositivo para una experiencia más rápida y nativa.',
        buttonLabel: 'Instalar app',
        alreadyInstalled: 'Ya instalada',
      },
      deleteEntities: {
        title: 'Eliminar todas las entidades y fusiones',
        description:
          'Elimina permanentemente todas las entidades extraídas (personas, temas, organizaciones, lugares, eventos, etiquetas) de tus correos, todas las fusiones de entidades y todas las sugerencias de fusión de IA. Esta acción no se puede deshacer.',
        buttonLabel: 'Eliminar todas las entidades y fusiones',
        confirmTitle: '¿Eliminar todas las entidades y fusiones?',
        confirmDescription:
          'Esto eliminará permanentemente todas las entidades extraídas de tus correos, las fusiones y las sugerencias de fusión de IA. Esta acción no se puede deshacer.',
        cancel: 'Cancelar',
        confirmButton: 'Eliminar todo',
        successToast: 'Todos los datos de entidades eliminados.',
        errorToast: 'Error al eliminar los datos de entidades.',
      },
      clearAnalysis: {
        title: 'Eliminar todo el análisis de IA',
        description:
          'Elimina todo el análisis generado por IA, el contenido procesado, el uso de tokens y los datos de coste de tus correos. Solo se conservan los mensajes originales. También elimina todo el conocimiento de entidades, fusiones y grafos en caché. Esta acción no se puede deshacer.',
        buttonLabel: 'Eliminar todo el análisis de IA',
        confirmTitle: '¿Eliminar todo el análisis de IA?',
        confirmDescription:
          'Esto eliminará permanentemente todo el análisis de IA, el contenido procesado, el uso de tokens, las entidades, las fusiones y los grafos en caché de tus correos. Solo se conservan los mensajes originales. Esta acción no se puede deshacer.',
        cancel: 'Cancelar',
        confirmButton: 'Eliminar todo el análisis',
        successToast: 'Todos los datos de análisis de IA eliminados.',
        errorToast: 'Error al eliminar los datos de análisis de IA.',
      },
      resetUsageStats: {
        title: 'Restablecer estadísticas de coste y tokens',
        description:
          'Restablece a cero todos los valores guardados de tokens y coste estimado de tus correos procesados. Esto no elimina los correos.',
        buttonLabel: 'Restablecer estadísticas de coste y tokens',
        confirmTitle: '¿Restablecer estadísticas de coste y tokens?',
        confirmDescription:
          'Esto restablecerá a cero todos los valores guardados de tokens y coste estimado de tus correos procesados. Esta acción no se puede deshacer.',
        cancel: 'Cancelar',
        confirmButton: 'Restablecer estadísticas',
        successToast: 'Estadísticas de coste y tokens restablecidas.',
        errorToast: 'Error al restablecer las estadísticas de coste y tokens.',
      },
      clearMemories: {
        title: 'Borrar todas las memorias',
        description:
          'Elimina permanentemente todas las memorias guardadas del usuario, incluido el historial local y los datos de Supermemory cuando estén configurados. Esta acción no se puede deshacer.',
        buttonLabel: 'Borrar todas las memorias',
        confirmTitle: '¿Borrar todas las memorias?',
        confirmDescription:
          'Esto eliminará permanentemente todas tus memorias guardadas. Esta acción no se puede deshacer.',
        cancel: 'Cancelar',
        confirmButton: 'Borrar memorias',
        successToast: 'Todas las memorias eliminadas.',
        errorToast: 'Error al eliminar las memorias.',
      },
      charts: {
        myEmailVolume: 'Mi volumen de correos',
        received: 'Recibidos',
        processing: 'En proceso',
        forwarded: 'Reenviados',
        error: 'Error',
        skipped: 'Omitidos',
        estimatedCost: 'Coste estimado',
        estCost: 'Coste est.',
        last24h: 'Últimas 24h',
        last7days: 'Últimos 7 días',
        last30days: 'Últimos 30 días',
        perHour: 'Por hora',
        perDay: 'Por día',
        perWeek: 'Por semana',
        weekOf: 'Semana del',
      },
      emailHistory: {
        allStatuses: 'Todos los estados',
        filterByStatus: 'Filtrar por estado',
        refresh: 'Actualizar',
        showPostinoHeader: 'Mostrar encabezado Postino en correos reenviados',
        noEmailsWithStatus: 'No hay correos con estado',
        clearFilter: 'Borrar filtros',
        noEmailsYet: 'Aún no se han procesado correos.',
        noEmailsYetDesc: '¡Envía un correo a tu dirección Postino para empezar!',
        selectEmailToRead: 'Selecciona un correo para leer',
        from: 'De:',
        to: 'Para:',
        cc: 'Cc:',
        bcc: 'Bcc:',
        attachments: 'Adjuntos:',
        downloadAttachment: 'Descargar adjunto',
        noAttachmentsShort: 'Ninguno',
        ruleApplied: 'Regla aplicada:',
        tokens: 'Tokens:',
        viewOriginal: 'Ver correo original',
        viewFullPage: 'Página completa',
        loadingEmail: 'Cargando correo…',
        searchPlaceholder: 'Buscar correos…',
        withAttachments: 'Con adjuntos',
        applyFilters: 'Buscar',
        results: 'resultados',
        messages: 'mensajes',
        previous: 'Anterior',
        next: 'Siguiente',
        page: 'Página',
        of: 'de',
        aiAnalysis: 'Análisis IA',
        tabSummary: 'Detalles',
        tabContent: 'Contenido',
        tabAiAnalysis: 'IA',
        noAiAnalysis: 'No hay análisis de IA disponible.',
        analysisType: 'Tipo:',
        analysisSentiment: 'Sentimiento:',
        analysisPriority: 'Prioridad:',
        analysisLanguage: 'Idioma:',
        analysisSenderType: 'Tipo de remitente:',
        analysisIntent: 'Intención:',
        analysisTags: 'Etiquetas:',
        analysisTopics: 'Temas:',
        analysisRequiresResponse: 'Requiere respuesta',
        analysisEntitiesPeople: 'Personas:',
        analysisEntitiesOrganizations: 'Organizaciones:',
        analysisEntitiesPlaces: 'Lugares:',
        analysisEntitiesEvents: 'Eventos:',
        analysisEntitiesDates: 'Fechas:',
        analysisEntitiesPrices: 'Precios:',
        rerunAnalysis: 'Repetir análisis',
        rerunningAnalysis: 'Repitiendo análisis...',
        deleteEmail: 'Eliminar correo',
        deleteEmailConfirm:
          '¿Seguro que quieres eliminar permanentemente este correo? Esta acción no se puede deshacer.',
        deleteEmailSuccess: 'Correo eliminado.',
        deleteEmailError: 'No se pudo eliminar el correo.',
        failedToLoad: 'Error al cargar los correos',
        failedToLoadCount: 'Error al cargar el recuento de correos',
      },
      search: {
        title: 'Buscar correos',
        toggleFilters: 'Mostrar/ocultar filtros',
        searchPlaceholder: 'Buscar por asunto, remitente, resumen, etiquetas…',
        applyFilters: 'Buscar',
        noResults: 'Ningún correo coincide con los filtros.',
        filterStatus: 'Estado',
        filterSentiment: 'Sentimiento',
        filterCategory: 'Categoría',
        filterPriority: 'Prioridad',
        filterSenderType: 'Tipo de remitente',
        filterLanguage: 'Idioma',
        filterTags: 'Etiquetas',
        filterPeople: 'Personas',
        filterOrgs: 'Organizaciones',
        filterPlaces: 'Lugares',
        filterEvents: 'Eventos',
        filterNumbers: 'Números y códigos',
        languagePlaceholder: 'Seleccionar idioma…',
        tagsPlaceholder: 'Seleccionar etiquetas…',
        peoplePlaceholder: 'Seleccionar personas…',
        orgsPlaceholder: 'Seleccionar organizaciones…',
        placesPlaceholder: 'Seleccionar lugares…',
        eventsPlaceholder: 'Seleccionar eventos…',
        numbersPlaceholder: 'Seleccionar números/códigos…',
        advancedFilters: 'Filtros avanzados',
        withAttachments: 'Con adjuntos',
        requiresResponse: 'Requiere respuesta',
        hasActionItems: 'Tiene tareas pendientes',
        isUrgent: 'Urgente',
        allSentiments: 'Todos los sentimientos',
        sentimentPositive: 'Positivo',
        sentimentNeutral: 'Neutro',
        sentimentNegative: 'Negativo',
        allCategories: 'Todas las categorías',
        typeNewsletter: 'Newsletter',
        typeTransactional: 'Transaccional',
        typePromotional: 'Promocional',
        typePersonal: 'Personal',
        typeNotification: 'Notificación',
        typeAutomated: 'Automatizado',
        typeOther: 'Otro',
        allPriorities: 'Todas las prioridades',
        priorityLow: 'Baja',
        priorityNormal: 'Normal',
        priorityHigh: 'Alta',
        priorityCritical: 'Crítica',
        allSenderTypes: 'Todos los tipos',
        senderHuman: 'Persona',
        senderAutomated: 'Automatizado',
        senderBusiness: 'Empresa',
        senderNewsletter: 'Newsletter',
      },
      knowledge: {
        title: 'Explorar emails',
        subtitle: 'Explora temas, personas y organizaciones de tus correos',
        allCategories: 'Todo',
        topics: 'Temas',
        people: 'Personas',
        organizations: 'Organizaciones',
        places: 'Lugares',
        events: 'Eventos',
        tags: 'Etiquetas',
        numbers: 'Números y códigos',
        emailsAnalyzed: '{count} correos analizados',
        noData: 'Sin datos de conocimiento',
        noDataDesc:
          'Envía algunos correos a tu dirección Postino para comenzar a construir tu gráfico de conocimiento.',
        searchInInbox: 'Buscar en bandeja',
        loading: 'Cargando…',
        mentions: 'menciones',
        relatedEmails: 'Correos relacionados',
        relatedEmailsDesc: 'Correos que mencionan',
        noRelatedEmails: 'No se encontraron correos para este término.',
        merge: 'Fusionar',
        mergeMode: 'Seleccionar para fusionar',
        cancelMerge: 'Cancelar',
        mergeSelected: 'Fusionar seleccionados',
        mergeDialogTitle: 'Fusionar entidades',
        mergeDialogDesc: 'Estas entidades se combinarán en una sola.',
        canonicalName: 'Nombre canónico',
        canonicalNamePlaceholder: 'Nombre a mostrar',
        mergeChipHint: 'Haz clic en un nombre para usarlo como nombre canónico',
        createMerge: 'Crear fusión',
        mergeSameCategoryWarning:
          'Selecciona 2 o más entidades de la misma categoría para fusionar.',
        manageMerges: 'Gestionar fusiones',
        noMerges: 'No hay fusiones definidas.',
        deleteMerge: 'Eliminar fusión',
        deleteConfirm: '¿Estás seguro de que quieres eliminar',
        mergesTitle: 'Fusiones de entidades',
        mergesDesc:
          'Las entidades fusionadas se muestran como un único elemento en la vista de conocimiento.',
        listTab: 'Lista',
        mergedTab: 'Fusionados',
        suggestionsTab: 'Sugerencias',
        xSelected: '{count} seleccionados',
        mergedFrom: 'Fusionado de',
        mergeCreated: 'Fusión creada',
        mergeDeleted: 'Fusión eliminada',
        cannotBeUndone: 'Esta acción no se puede deshacer.',
        suggestionsAskAI: 'Pedir sugerencias a IA',
        suggestionsAskAIDesc: 'La IA analizará tus entidades y sugerirá posibles fusiones.',
        suggestionsGenerating: 'Generando sugerencias…',
        suggestionsEmpty: 'Sin sugerencias',
        suggestionsEmptyDesc: 'Haz clic en el botón para pedir a la IA que sugiera fusiones.',
        suggestionsAccept: 'Aceptar',
        suggestionsReject: 'Rechazar',
        suggestionsCompleteFirst: 'Completa todas las sugerencias antes de generar nuevas.',
        suggestionsError: 'Error al generar sugerencias. Inténtalo de nuevo.',
        failedToLoad: 'Error al cargar los datos',
        failedToLoadMerges: 'Error al cargar las fusiones',
        failedToLoadSuggestions: 'Error al cargar las sugerencias',
        suggestionsGenerated: 'Sugerencias generadas',
        relations: {
          viewToggle: 'Mapa de relaciones',
          exploreToggle: 'Explorar',
          title: 'Mapa de relaciones',
          subtitle: 'Conexiones entre entidades descubiertas en tus correos',
          generate: 'Generar relaciones',
          generating: 'Generando…',
          regenerate: 'Regenerar',
          noGraph: 'Sin mapa de relaciones',
          noGraphDesc:
            'Haz clic en "Generar relaciones" para descubrir conexiones entre entidades de tus correos.',
          generatedOn: 'Generado el {date}',
          totalEmails: 'Basado en {count} correos',
          error: 'Error al generar relaciones',
          nodeClickHint: 'Selecciona un nodo para resaltar conexiones',
          nodeClickHint2: 'Usa el botón para explorar correos relacionados',
          openRelatedEmails: 'Abrir correos relacionados',
          expandFullPage: 'Página completa',
          closeFullPage: 'Cerrar',
          legend: 'Leyenda',
          loadError: 'Error al cargar el mapa de relaciones',
          generated: 'Gráfico de relaciones actualizado',
          graphTab: 'Gráfico',
          flowTab: 'Flujo',
          mapTab: 'Mapa',
          flowNodeClick:
            'Haz clic una vez para resaltar las entidades conectadas y luego usa el botón para explorar correos relacionados',
          flowGenerate: 'Generar flujo',
          flowGenerating: 'Generando…',
          flowRegenerate: 'Regenerar flujo',
          flowNoGraph: 'Sin diagrama de flujo',
          flowNoGraphDesc:
            'Haz clic en "Generar flujo" para visualizar cómo evolucionaron las entidades en tus correos.',
          flowError: 'Error al generar el diagrama de flujo',
          flowLoadError: 'Error al cargar el diagrama de flujo',
          flowGenerated: 'Diagrama de flujo actualizado',
          flowGeneratedOn: 'Generado el {date}',
          flowTotalEmails: 'Basado en {count} correos',
          mapPinClick:
            'Haz clic en un pin para seleccionar un lugar y luego usa el botón para explorar correos relacionados',
          mapGenerate: 'Generar mapa',
          mapRegenerate: 'Regenerar mapa',
          mapNoGraph: 'Aún no hay mapa de lugares',
          mapNoGraphDesc:
            'Haz clic en "Generar mapa" para colocar en un mapa real los lugares mencionados en tus correos.',
          mapError: 'Error al generar el mapa de lugares',
          mapLoadError: 'Error al cargar el mapa de lugares',
          mapGenerated: 'Mapa de lugares actualizado',
          mapGeneratedOn: 'Generado el {date}',
          mapTotalEmails: 'Basado en {count} correos',
        },
      },
      rules: {
        yourRules: 'Tus reglas',
        active: 'Activa',
        disabled: 'Desactivada',
        appliedTopToBottom: 'Las reglas se aplican de arriba hacia abajo.',
        useArrows: 'Usa las flechas para cambiar el orden.',
        addARule: 'Crear regla',
        newRule: 'Nueva regla',
        ruleName: 'Nombre de la regla',
        ruleDescription: 'Descripción de la regla',
        hideFilters: 'Ocultar filtros',
        addFilters: 'Añadir filtros de remitente/asunto/cuerpo (opcional)',
        editFilters: 'Editar filtros de remitente/asunto/cuerpo (opcional)',
        filterHelp:
          'Aplica esta regla solo cuando el correo coincida con todos los patrones proporcionados (contiene, sin distinción de mayúsculas). Deja en blanco para aplicar a todos los correos.',
        senderContains: 'Remitente contiene',
        subjectContains: 'Asunto contiene',
        bodyContains: 'Cuerpo contiene',
        ruleNamePlaceholder: 'ej. Resumen de newsletter',
        ruleDescriptionPlaceholder:
          'Ejemplo: Resume las newsletters y elimina el contenido promocional. Conserva solo los artículos y enlaces clave.',
        senderPlaceholder: 'ej. newsletter@ejemplo.com',
        subjectPlaceholder: 'ej. Resumen semanal',
        bodyPlaceholder: 'ej. cancelar suscripción',
        addRule: 'Añadir regla',
        cancel: 'Cancelar',
        saveChanges: 'Guardar cambios',
        noRulesYet: '¡Aún no hay reglas. Añade tu primera regla arriba!',
        exampleRule: 'Ejemplo: "Eliminar anuncios y resumir boletines"',
        sender: 'Remitente:',
        subject: 'Asunto:',
        body: 'Cuerpo:',
        updated: 'Actualizado',
        moveRuleUp: 'Mover regla arriba',
        moveRuleDown: 'Mover regla abajo',
        processingOrder: 'Orden de procesamiento',
        edit: 'Editar',
        delete: 'Eliminar',
        deleteRule: 'Eliminar regla',
        deleteConfirm: '¿Estás seguro de que quieres eliminar',
        cannotBeUndone: 'Esta acción no se puede deshacer.',
        close: 'Cerrar',
        searchPlaceholder: 'Buscar reglas…',
        noMatchingRules: 'Ninguna regla coincide con tu búsqueda.',
        ruleCreated: 'Regla creada',
        ruleSaved: 'Regla guardada',
        ruleEnabled: 'Regla activada',
        ruleDisabled: 'Regla desactivada',
        ruleDeleted: 'Regla eliminada',
        errors: {
          nameRequired: 'El nombre de la regla es obligatorio',
          textRequired: 'El texto de la regla es obligatorio',
          nameTooLong: 'El nombre de la regla no puede superar {max} caracteres',
          textTooLong: 'La regla supera la longitud máxima de {max} caracteres',
          failedToCreate: 'Error al crear la regla',
          failedToUpdate: 'Error al actualizar la regla',
          failedToDelete: 'Error al eliminar la regla',
          failedToReorder: 'Error al reordenar las reglas',
        },
      },
      pwaInstall: {
        title: 'Añadir Postino a tu pantalla de inicio',
        description:
          'Obtén un acceso más rápido y una mejor experiencia instalando la app en tu dispositivo.',
        howToTitle: 'Cómo instalar:',
        iosSafariStep1Pre: 'Toca el',
        iosSafariStep1Post: 'botón Compartir en la barra del navegador.',
        iosSafariStep2Pre: 'Toca',
        iosSafariStep2Bold: 'Añadir a pantalla de inicio',
        iosSafariStep3: 'Toca Añadir en la esquina superior derecha para confirmar.',
        iosSafari26Step1Pre: 'Toca el',
        iosSafari26Step1Post: 'botón en la barra del navegador.',
        iosSafari26Step2Pre: 'Toca',
        iosSafari26Step2Bold: 'Compartir',
        iosSafari26Step2Post: 'en el menú.',
        iosSafari26Step3Pre: 'Toca',
        iosSafari26Step3Bold: 'Más',
        iosSafari26Step4Pre: 'Selecciona',
        iosSafari26Step4Bold: 'Añadir a pantalla de inicio',
        iosSafari26Step4Post: 'del menú. Es posible que debas desplazarte hacia abajo.',
        iosSafari26iPadStep1Pre: 'Toca el',
        iosSafari26iPadStep1Post: 'botón Compartir en la barra del navegador.',
        iosChromeStep1Pre: 'Toca el',
        iosChromeStep1Post: 'botón en la esquina superior derecha.',
        iosChromeStep2Pre: 'Selecciona',
        iosChromeStep2Bold: 'Añadir a pantalla de inicio',
        iosChromeStep2Post: ' del menú. Es posible que debas desplazarte para encontrarlo.',
        iosChromeStep3: 'Toca Añadir para confirmar.',
        androidStep1Pre: 'Toca el',
        androidStep1Post: 'botón de menú en la esquina superior derecha.',
        androidStep2Pre: 'Toca',
        androidStep2Bold: 'Añadir a pantalla de inicio',
        androidStep3: 'Toca Añadir para confirmar.',
        installButton: 'Instalar app',
        notNow: 'Ahora no',
      },
      toasts: {
        settingSaved: 'Ajuste guardado',
        failedToLoadStats: 'Error al cargar las estadísticas',
        failedToUpdateEmailSetting: 'Error al actualizar la dirección de correo',
        failedToUpdateForwardingHeaderSetting: 'Error al actualizar el encabezado de reenvío',
        failedToUpdateAiAnalysisOnlySetting:
          'Error al actualizar la configuración de solo análisis IA',
        failedToUpdateAnalysisLanguageSetting: 'Error al actualizar el idioma de análisis',
        analysisRefreshed: 'Análisis de IA actualizado.',
        analysisRefreshFailed: 'No se pudo actualizar el análisis de IA.',
        downloadAttachmentFailed: 'No se pudo descargar el adjunto.',
      },
      agent: {
        title: 'Agente de Memoria',
        subtitle: 'Pregúntame sobre tus correos.',
        placeholder: 'Pregunta algo como "¿Qué boletines recibí esta semana?"',
        inputPlaceholder: 'Pregunta sobre tus correos…',
        send: 'Enviar',
        noAnswer: 'No se encontró respuesta.',
        errorFallback: 'Algo salió mal. Por favor, inténtalo de nuevo.',
        sendHint: 'La IA puede cometer errores, verifica siempre.',
        clearConversation: 'Borrar conversación',
        clearConfirmTitle: '¿Borrar conversación?',
        clearConfirmDescription:
          'Esto eliminará todos los mensajes de la sesión actual. Esta acción no se puede deshacer.',
        clearConfirmButton: 'Borrar',
        cancelClear: 'Cancelar',
        expandFullPage: 'Página completa',
        closeFullPage: 'Cerrar',
        sourceEmails: 'Correos de referencia',
        cta: {
          title: 'Tu agente de IA está listo',
          description: 'Pregúntame sobre tus correos.',
          button: '¡Pregúntame todo sobre tus correos!',
        },
      },
    },
    emailOriginal: {
      back: 'Volver',
      originalEmail: 'Correo original',
      from: 'De:',
      to: 'Para:',
      cc: 'Cc:',
      bcc: 'Bcc:',
      subject: 'Asunto:',
      received: 'Recibido:',
      emailContent: 'Contenido del correo',
      openFullPageView: 'Página completa',
      openFullPageViewAria: 'Abrir correo en página completa',
      noOriginalContent: 'No hay contenido original almacenado.',
      closeFullPageView: 'Cerrar vista de página completa',
      attachments: 'Archivos adjuntos:',
      noAttachments: 'Sin archivos adjuntos.',
      errors: {
        noPermission: 'No tienes permiso para ver este correo.',
        notFound: 'Correo no encontrado.',
        failedToLoad: 'No se pudo cargar el correo.',
      },
      admin: {
        currentSetup: 'Configuración actual',
        loadingModels: 'Cargando modelos…',
        defaultModel: 'Modelo predeterminado',
        searchModels: 'Buscar modelos...',
        noModelsFound: 'No se encontraron modelos.',
        processing: 'Procesando…',
        analyze: 'Probar análisis IA',
        failedToAnalyze: 'No se pudo analizar el correo.',
        analysisResult: 'Análisis IA:',
        extractedMarkdown: 'Markdown extraído:',
        modelUsed: 'Modelo usado:',
        reprocess: 'Reprocesar',
        failedToReprocess: 'No se pudo reprocesar el correo.',
        ruleApplied: 'Regla aplicada:',
        tokensUsed: 'Tokens usados:',
        estCost: 'Coste est.:',
        processedBody: 'Cuerpo procesado:',
      },
    },
    admin: {
      users: {
        rerunAnalysis: 'Volver a ejecutar análisis IA',
        rerunAnalysisTitle: 'Volver a ejecutar análisis IA',
        rerunAnalysisDesc:
          '¿Eliminar todo el análisis de IA guardado para {email} y volver a ejecutarlo en cada correo de esta bandeja? Esto puede tardar un poco.',
        rerunAnalysisPreparing: 'Preparando…',
        rerunAnalysisProgress: '{done} / {total} correos ({percent}%)',
        rerunAnalysisRetry: 'Reintentar',
        resetData: 'Restablecer datos',
        resetDataTitle: 'Restablecer datos del usuario',
        resetDataDesc:
          '¿Eliminar todos los datos almacenados de {email} y crear un perfil nuevo de Postino? El acceso seguirá activo, pero se eliminarán correos, reglas, trabajos, conocimiento y cachés.',
      },
      toasts: {
        settingsSaved: 'Ajustes guardados',
        failedToLoadStats: 'Error al cargar las estadísticas',
        failedToLoadChartData: 'Error al cargar los datos del gráfico',
        userDeleted: 'Usuario eliminado',
        adminGranted: 'Privilegios de administrador concedidos',
        adminRemoved: 'Privilegios de administrador eliminados',
        userSuspended: 'Usuario suspendido',
        userActivated: 'Usuario activado',
        userAnalysesRerun: 'Análisis de IA actualizado para {count} correos.',
        userAnalysesRerunPartial:
          'Análisis de IA actualizado para {done} correos, {failed} fallaron, {skipped} se omitieron.',
        failedToRerunUserAnalyses: 'No se pudo volver a ejecutar el análisis de IA del usuario.',
        userDataReset: 'Datos del usuario restablecidos',
        failedToResetUserData: 'Error al restablecer los datos del usuario',
        failedToUpdateUser: 'Error al actualizar el usuario',
        failedToProcessQueue: 'Error al procesar el lote de la cola',
        failedToUpdateMailgunSetting: 'Error al actualizar la configuración de Mailgun',
        failedToClearLogs: 'Error al limpiar los registros',
      },
    },
  },
  fr: {
    nav: {
      signIn: 'Se connecter',
      getStarted: 'Commencer',
      signOut: 'Se déconnecter',
      dashboard: 'Tableau de bord',
      admin: 'Admin',
      allRightsReserved: 'Tous droits réservés.',
    },
    language: {
      select: 'Langue',
    },
    home: {
      hero: {
        words: ['résume', 'organise', 'traduit', 'affine'],
        emailsAndNewsletters: 'e-mails & newsletters',
        subtitle:
          "Obtenez une adresse e-mail privée.\nRédigez des règles simples en langage naturel.\nL'IA de Postino traite vos e-mails entrants — en résumant les newsletters, en supprimant les publicités, en extrayant les informations clés et bien plus — puis vous transmet le résultat.",
        startFree: 'Commencer gratuitement',
        howItWorks: 'Comment ça marche',
      },
      howItWorks: {
        title: 'Comment ça marche',
        step1: {
          title: 'Obtenez votre adresse',
          desc: 'Inscrivez-vous et obtenez une adresse e-mail Postino unique comme amber-2026@postino.pro',
        },
        step2: {
          title: 'Rédigez vos règles',
          desc: 'Dites à Postino quoi faire en français simple : "Résume les newsletters", "Supprime le contenu promotionnel", etc.',
        },
        step3: {
          title: 'Recevez les e-mails traités',
          desc: "Postino traite les e-mails entrants avec l'IA et transmet un contenu propre et utile à votre boîte de réception.",
        },
      },
      exampleRules: {
        title: 'Exemples de règles',
        rules: [
          'Résumer les newsletters et supprimer toutes les publicités et contenus promotionnels',
          "Extraire et lister uniquement les éléments d'action importants des e-mails",
          'Traduire les e-mails en français et résumer les points principaux',
          'Pour les reçus et confirmations de commande, extraire uniquement les détails de la commande et le total',
          'Supprimer les pixels de suivi et réécrire les liens proprement',
          "Si l'e-mail est une offre promotionnelle, l'ignorer complètement",
        ],
      },
      blog: {
        title: 'Postino Blog',
        subtitle: "Conseils, mises à jour et informations de l'équipe Postino",
        readMore: 'Lire la suite',
        backToBlog: 'Retour au Blog',
        cta: {
          title: 'Lisez notre Blog',
          subtitle:
            'Découvrez des conseils, des guides et des mises à jour sur la gestion des e-mails par IA.',
          button: 'Explorer les articles',
        },
      },
    },
    auth: {
      login: {
        welcomeBack: 'Bon retour',
        signInToAccount: 'Connectez-vous à votre compte',
        emailAddress: 'Adresse e-mail',
        password: 'Mot de passe',
        forgotPassword: 'Mot de passe oublié ?',
        signIn: 'Se connecter',
        noAccount: "Vous n'avez pas de compte ?",
        signUp: "S'inscrire",
        errors: {
          invalidCredential: 'E-mail ou mot de passe invalide',
          tooManyRequests: 'Trop de tentatives échouées. Veuillez réessayer plus tard.',
          failed: 'Échec de la connexion. Veuillez réessayer.',
          suspended: 'Votre compte a été suspendu. Veuillez contacter le support.',
          emailNotVerified: 'Veuillez vérifier votre adresse e-mail avant de vous connecter.',
        },
      },
      register: {
        createAccount: 'Créez votre compte',
        getYourAddress: 'Obtenez votre adresse Postino personnelle',
        emailAddress: 'Adresse e-mail',
        password: 'Mot de passe',
        minChars: 'Min. 8 caractères',
        confirmPassword: 'Confirmer le mot de passe',
        repeatPassword: 'Répéter le mot de passe',
        alreadyHaveAccount: 'Vous avez déjà un compte ?',
        signIn: 'Se connecter',
        button: 'Créer un compte',
        maintenanceMessage:
          'Nous améliorons le service. Les nouvelles inscriptions sont suspendues pendant la maintenance. Veuillez réessayer plus tard.',
        errors: {
          passwordsMismatch: 'Les mots de passe ne correspondent pas',
          passwordTooShort: 'Le mot de passe doit comporter au moins 8 caractères',
          emailAlreadyInUse: 'Un compte avec cet e-mail existe déjà',
          weakPassword: 'Le mot de passe est trop faible',
          blockedDomain: 'Vous ne pouvez pas créer un compte avec nos adresses e-mail',
          failed: 'Échec de la création du compte. Veuillez réessayer.',
        },
      },
      forgotPassword: {
        title: 'Réinitialiser le mot de passe',
        subtitle: 'Entrez votre e-mail pour recevoir un lien de réinitialisation',
        emailAddress: 'Adresse e-mail',
        sendResetLink: 'Envoyer le lien de réinitialisation',
        rememberedPassword: 'Vous vous souvenez de votre mot de passe ?',
        backToSignIn: 'Retour à la connexion',
        successMessage:
          'Si un compte existe pour cet e-mail, nous vous avons envoyé un lien de réinitialisation du mot de passe.',
        errors: {
          invalidEmail: 'Adresse e-mail invalide',
          tooManyAttempts: 'Trop de tentatives. Veuillez réessayer plus tard.',
          failed: "Échec de l'envoi de l'e-mail de réinitialisation. Veuillez réessayer.",
        },
      },
      dashboardLink: {
        alreadySignedIn: 'Vous êtes déjà connecté.',
        goToDashboard: 'Aller au tableau de bord',
        loadingDashboard: 'Chargement du tableau de bord…',
      },
    },
    dashboard: {
      title: 'Tableau de bord',
      subtitle: 'Gérez votre adresse Postino et vos règles e-mail',
      tabs: {
        overview: "Vue d'ensemble",
        myRules: 'Mes règles',
        emailHistory: 'Historique des e-mails',
        inbox: 'Boîte de réception',
        explore: 'Explorer',
        relations: 'Relations',
        settings: 'Paramètres',
        agent: 'Mémoire',
      },
      address: {
        title: 'Votre adresse Postino',
        active: 'Active',
        disabled: 'Désactivée',
        activeDescription:
          'Envoyez des e-mails à cette adresse et ils seront traités selon vos règles, puis transmis à votre e-mail',
        disabledDescription:
          'Votre adresse Postino est désactivée. Les e-mails entrants seront enregistrés comme ignorés et ne seront pas transmis.',
        copy: 'Copier',
        copied: 'Copié',
        toggleAriaLabel: 'Activer ou désactiver votre adresse Postino',
        aiAnalysisOnly: 'Analyse IA uniquement',
        aiAnalysisOnlyEnabledDescription:
          "Les e-mails entrants sont analysés par l'IA et enregistrés en mémoire, mais les règles et le transfert sont ignorés.",
        aiAnalysisOnlyDisabledDescription:
          "Activez pour analyser les e-mails avec l'IA et mettre à jour la mémoire même lorsque le transfert est désactivé.",
        aiAnalysisOnlyToggleAriaLabel: 'Activer ou désactiver le mode analyse IA uniquement',
      },
      stats: {
        emailsReceived: 'E-mails reçus',
        emailsForwarded: 'E-mails transmis',
        emailsErrored: 'E-mails en erreur',
        emailsSkipped: 'E-mails ignorés',
        tokensUsed: 'Tokens utilisés',
        estCost: 'Coût est.',
        period: 'Période',
        last24h: 'Dernières 24h',
        last7days: '7 derniers jours',
        lastMonth: 'Dernier mois',
        allTime: 'Tout',
      },
      pushNotifications: {
        title: 'Notifications push',
        enabledDescription:
          "Vous recevrez une notification du navigateur chaque fois qu'un e-mail est traité.",
        disabledDescription:
          "Activez pour recevoir une notification du navigateur à chaque nouveau traitement d'e-mail.",
        blockedDescription:
          'Les notifications sont bloquées par votre navigateur. Ouvrez les paramètres du site dans votre navigateur et autorisez les notifications pour activer cette fonctionnalité.',
      },
      forwardingHeader: {
        title: 'En-tête Postino dans les e-mails transmis',
        enabledDescription:
          'Un encadré récapitulatif Postino est ajouté au bas de chaque e-mail transmis.',
        disabledDescription:
          "L'encadré récapitulatif Postino n'est pas ajouté aux e-mails transmis.",
      },
      analysisLanguage: {
        title: "Langue d'analyse IA",
        description:
          "Choisissez la langue pour le contenu généré par l'IA (résumé, intention, étiquettes, sujets). Sélectionnez « Auto » pour utiliser l'anglais (par défaut).",
        selectPlaceholder: 'Sélectionner la langue',
        autoLabel: 'Auto (Anglais)',
      },
      installApp: {
        title: "Installer l'application Postino",
        description:
          'Installez Postino comme application sur votre appareil pour une expérience plus rapide et native.',
        buttonLabel: "Installer l'application",
        alreadyInstalled: 'Déjà installée',
      },
      deleteEntities: {
        title: 'Supprimer toutes les entités et fusions',
        description:
          "Supprime définitivement toutes les entités extraites (personnes, sujets, organisations, lieux, événements, tags) de vos e-mails, toutes les fusions d'entités et toutes les suggestions de fusion IA. Cette action est irréversible.",
        buttonLabel: 'Supprimer toutes les entités et fusions',
        confirmTitle: 'Supprimer toutes les entités et fusions ?',
        confirmDescription:
          'Cela supprimera définitivement toutes les entités extraites de vos e-mails, vos fusions et vos suggestions de fusion IA. Cette action est irréversible.',
        cancel: 'Annuler',
        confirmButton: 'Tout supprimer',
        successToast: "Toutes les données d'entités supprimées.",
        errorToast: "Échec de la suppression des données d'entités.",
      },
      clearAnalysis: {
        title: "Supprimer toute l'analyse IA",
        description:
          "Supprime toute l'analyse générée par l'IA, le contenu traité, l'utilisation de tokens et les données de coût de vos e-mails. Seuls les messages originaux sont conservés. Supprime également toutes les entités, fusions et graphes mis en cache. Cette action est irréversible.",
        buttonLabel: "Supprimer toute l'analyse IA",
        confirmTitle: "Supprimer toute l'analyse IA ?",
        confirmDescription:
          "Cela supprimera définitivement toute l'analyse IA, le contenu traité, l'utilisation de tokens, les entités, les fusions et les graphes mis en cache de vos e-mails. Seuls les messages originaux sont conservés. Cette action est irréversible.",
        cancel: 'Annuler',
        confirmButton: "Supprimer toute l'analyse",
        successToast: "Toutes les données d'analyse IA supprimées.",
        errorToast: "Échec de la suppression des données d'analyse IA.",
      },
      resetUsageStats: {
        title: 'Réinitialiser les statistiques de coût et de tokens',
        description:
          'Remet à zéro toutes les valeurs enregistrées de tokens et de coût estimé pour vos e-mails traités. Les e-mails eux-mêmes ne sont pas supprimés.',
        buttonLabel: 'Réinitialiser les statistiques de coût et de tokens',
        confirmTitle: 'Réinitialiser les statistiques de coût et de tokens ?',
        confirmDescription:
          'Cela remettra à zéro toutes les valeurs enregistrées de tokens et de coût estimé pour vos e-mails traités. Cette action est irréversible.',
        cancel: 'Annuler',
        confirmButton: 'Réinitialiser',
        successToast: 'Statistiques de coût et de tokens réinitialisées.',
        errorToast: 'Échec de la réinitialisation des statistiques de coût et de tokens.',
      },
      clearMemories: {
        title: 'Effacer toutes les mémoires',
        description:
          "Supprime définitivement toutes les mémoires utilisateur enregistrées, y compris l'historique local et les données Supermemory lorsqu'elles sont configurées. Cette action est irréversible.",
        buttonLabel: 'Effacer toutes les mémoires',
        confirmTitle: 'Effacer toutes les mémoires ?',
        confirmDescription:
          'Cela supprimera définitivement toutes vos mémoires enregistrées. Cette action est irréversible.',
        cancel: 'Annuler',
        confirmButton: 'Effacer les mémoires',
        successToast: 'Toutes les mémoires ont été effacées.',
        errorToast: "Échec de l'effacement des mémoires.",
      },
      charts: {
        myEmailVolume: "Mon volume d'e-mails",
        received: 'Reçus',
        processing: 'En cours',
        forwarded: 'Transmis',
        error: 'Erreur',
        skipped: 'Ignorés',
        estimatedCost: 'Coût estimé',
        estCost: 'Coût est.',
        last24h: 'Dernières 24h',
        last7days: '7 derniers jours',
        last30days: '30 derniers jours',
        perHour: 'Par heure',
        perDay: 'Par jour',
        perWeek: 'Par semaine',
        weekOf: 'Semaine du',
      },
      emailHistory: {
        allStatuses: 'Tous les statuts',
        filterByStatus: 'Filtrer par statut',
        refresh: 'Actualiser',
        showPostinoHeader: "Afficher l'en-tête Postino dans les e-mails transmis",
        noEmailsWithStatus: 'Aucun e-mail avec le statut',
        clearFilter: 'Effacer les filtres',
        noEmailsYet: "Aucun e-mail traité pour l'instant.",
        noEmailsYetDesc: 'Envoyez un e-mail à votre adresse Postino pour commencer !',
        selectEmailToRead: 'Sélectionnez un e-mail à lire',
        from: 'De :',
        to: 'À :',
        cc: 'Cc :',
        bcc: 'Bcc :',
        attachments: 'Pièces jointes :',
        downloadAttachment: 'Télécharger la pièce jointe',
        noAttachmentsShort: 'Aucune',
        ruleApplied: 'Règle appliquée :',
        tokens: 'Tokens :',
        viewOriginal: "Voir l'e-mail original",
        viewFullPage: 'Pleine page',
        loadingEmail: "Chargement de l'e-mail",
        searchPlaceholder: 'Rechercher des e-mails…',
        withAttachments: 'Avec pièces jointes',
        applyFilters: 'Rechercher',
        results: 'résultats',
        messages: 'messages',
        previous: 'Précédent',
        next: 'Suivant',
        page: 'Page',
        of: 'sur',
        aiAnalysis: 'Analyse IA',
        tabSummary: 'Détails',
        tabContent: 'Contenu',
        tabAiAnalysis: 'IA',
        noAiAnalysis: 'Aucune analyse IA disponible.',
        analysisType: 'Type :',
        analysisSentiment: 'Sentiment :',
        analysisPriority: 'Priorité :',
        analysisLanguage: 'Langue :',
        analysisSenderType: "Type d'expéditeur :",
        analysisIntent: 'Intention :',
        analysisTags: 'Tags :',
        analysisTopics: 'Sujets :',
        analysisRequiresResponse: 'Nécessite une réponse',
        analysisEntitiesPeople: 'Personnes :',
        analysisEntitiesOrganizations: 'Organisations :',
        analysisEntitiesPlaces: 'Lieux :',
        analysisEntitiesEvents: 'Événements :',
        analysisEntitiesDates: 'Dates :',
        analysisEntitiesPrices: 'Prix :',
        rerunAnalysis: "Relancer l'analyse",
        rerunningAnalysis: "Relance de l'analyse...",
        deleteEmail: "Supprimer l'e-mail",
        deleteEmailConfirm:
          'Voulez-vous vraiment supprimer définitivement cet e-mail ? Cette action est irréversible.',
        deleteEmailSuccess: 'E-mail supprimé.',
        deleteEmailError: "Impossible de supprimer l'e-mail.",
        failedToLoad: 'Échec du chargement des e-mails',
        failedToLoadCount: "Échec du chargement du nombre d'e-mails",
      },
      search: {
        title: 'Rechercher des e-mails',
        toggleFilters: 'Afficher/masquer les filtres',
        searchPlaceholder: 'Rechercher par objet, expéditeur, résumé, tags…',
        applyFilters: 'Rechercher',
        noResults: 'Aucun e-mail ne correspond aux filtres.',
        filterStatus: 'Statut',
        filterSentiment: 'Sentiment',
        filterCategory: 'Catégorie',
        filterPriority: 'Priorité',
        filterSenderType: "Type d'expéditeur",
        filterLanguage: 'Langue',
        filterTags: 'Tags',
        filterPeople: 'Personnes',
        filterOrgs: 'Organisations',
        filterPlaces: 'Lieux',
        filterEvents: 'Événements',
        filterNumbers: 'Numéros et codes',
        languagePlaceholder: 'Sélectionner une langue…',
        tagsPlaceholder: 'Sélectionner des tags…',
        peoplePlaceholder: 'Sélectionner des personnes…',
        orgsPlaceholder: 'Sélectionner des organisations…',
        placesPlaceholder: 'Sélectionner des lieux…',
        eventsPlaceholder: 'Sélectionner des événements…',
        numbersPlaceholder: 'Sélectionner des numéros/codes…',
        advancedFilters: 'Filtres avancés',
        withAttachments: 'Avec pièces jointes',
        requiresResponse: 'Nécessite une réponse',
        hasActionItems: 'A des actions à faire',
        isUrgent: 'Urgent',
        allSentiments: 'Tous les sentiments',
        sentimentPositive: 'Positif',
        sentimentNeutral: 'Neutre',
        sentimentNegative: 'Négatif',
        allCategories: 'Toutes les catégories',
        typeNewsletter: 'Newsletter',
        typeTransactional: 'Transactionnel',
        typePromotional: 'Promotionnel',
        typePersonal: 'Personnel',
        typeNotification: 'Notification',
        typeAutomated: 'Automatisé',
        typeOther: 'Autre',
        allPriorities: 'Toutes les priorités',
        priorityLow: 'Faible',
        priorityNormal: 'Normale',
        priorityHigh: 'Haute',
        priorityCritical: 'Critique',
        allSenderTypes: 'Tous les types',
        senderHuman: 'Humain',
        senderAutomated: 'Automatisé',
        senderBusiness: 'Entreprise',
        senderNewsletter: 'Newsletter',
      },
      knowledge: {
        title: 'Explorer les emails',
        subtitle: 'Explorez les sujets, personnes et organisations de vos emails',
        allCategories: 'Tout',
        topics: 'Sujets',
        people: 'Personnes',
        organizations: 'Organisations',
        places: 'Lieux',
        events: 'Événements',
        tags: 'Étiquettes',
        numbers: 'Numéros et codes',
        emailsAnalyzed: '{count} emails analysés',
        noData: 'Aucune donnée disponible',
        noDataDesc:
          'Envoyez des emails à votre adresse Postino pour commencer à construire votre graphe de connaissance.',
        searchInInbox: 'Rechercher dans la boîte',
        loading: 'Chargement…',
        mentions: 'mentions',
        relatedEmails: 'E-mails associés',
        relatedEmailsDesc: 'E-mails mentionnant',
        noRelatedEmails: 'Aucun e-mail trouvé pour ce terme.',
        merge: 'Fusionner',
        mergeMode: 'Sélectionner pour fusionner',
        cancelMerge: 'Annuler',
        mergeSelected: 'Fusionner la sélection',
        mergeDialogTitle: 'Fusionner les entités',
        mergeDialogDesc: 'Ces entités seront combinées en une seule.',
        canonicalName: 'Nom canonique',
        canonicalNamePlaceholder: 'Nom à afficher',
        mergeChipHint: "Cliquez sur un nom pour l'utiliser comme nom canonique",
        createMerge: 'Créer la fusion',
        mergeSameCategoryWarning:
          'Sélectionnez 2 entités ou plus de la même catégorie pour les fusionner.',
        manageMerges: 'Gérer les fusions',
        noMerges: 'Aucune fusion définie.',
        deleteMerge: 'Supprimer la fusion',
        deleteConfirm: 'Êtes-vous sûr de vouloir supprimer',
        mergesTitle: "Fusions d'entités",
        mergesDesc:
          'Les entités fusionnées apparaissent comme un seul élément dans la vue de connaissance.',
        listTab: 'Liste',
        mergedTab: 'Fusionnés',
        suggestionsTab: 'Suggestions',
        xSelected: '{count} sélectionnés',
        mergedFrom: 'Fusionné depuis',
        mergeCreated: 'Fusion créée',
        mergeDeleted: 'Fusion supprimée',
        cannotBeUndone: 'Cette action est irréversible.',
        suggestionsAskAI: "Demander des suggestions à l'IA",
        suggestionsAskAIDesc: "L'IA analysera vos entités et suggérera des fusions possibles.",
        suggestionsGenerating: 'Génération des suggestions…',
        suggestionsEmpty: 'Aucune suggestion',
        suggestionsEmptyDesc: "Cliquez sur le bouton pour demander à l'IA de suggérer des fusions.",
        suggestionsAccept: 'Accepter',
        suggestionsReject: 'Rejeter',
        suggestionsCompleteFirst:
          "Terminez toutes les suggestions avant d'en générer de nouvelles.",
        suggestionsError: 'Échec de la génération des suggestions. Veuillez réessayer.',
        failedToLoad: 'Échec du chargement des données',
        failedToLoadMerges: 'Échec du chargement des fusions',
        failedToLoadSuggestions: 'Échec du chargement des suggestions',
        suggestionsGenerated: 'Suggestions générées',
        relations: {
          viewToggle: 'Carte des relations',
          exploreToggle: 'Explorer',
          title: 'Carte des relations',
          subtitle: 'Connexions entre entités découvertes dans vos e-mails',
          generate: 'Générer les relations',
          generating: 'Génération…',
          regenerate: 'Régénérer',
          noGraph: 'Aucune carte des relations',
          noGraphDesc:
            'Cliquez sur "Générer les relations" pour découvrir les connexions entre entités dans vos e-mails.',
          generatedOn: 'Générée le {date}',
          totalEmails: 'Basé sur {count} e-mails',
          error: 'Échec de la génération des relations',
          nodeClickHint: 'Sélectionnez un nœud pour mettre en évidence les connexions',
          nodeClickHint2: 'Utilisez le bouton pour explorer les e-mails associés',
          openRelatedEmails: 'Ouvrir les e-mails associés',
          expandFullPage: 'Pleine page',
          closeFullPage: 'Fermer',
          legend: 'Légende',
          loadError: 'Échec du chargement de la carte des relations',
          generated: 'Graphe de relations mis à jour',
          graphTab: 'Graphe',
          flowTab: 'Flux',
          mapTab: 'Carte',
          flowNodeClick:
            'Cliquez une fois pour mettre en évidence les entités connectées, puis utilisez le bouton pour explorer les e-mails associés',
          flowGenerate: 'Générer le flux',
          flowGenerating: 'Génération…',
          flowRegenerate: 'Régénérer le flux',
          flowNoGraph: 'Aucun diagramme de flux',
          flowNoGraphDesc:
            'Cliquez sur "Générer le flux" pour visualiser l\'évolution des entités dans le temps.',
          flowError: 'Échec de la génération du diagramme de flux',
          flowLoadError: 'Échec du chargement du diagramme de flux',
          flowGenerated: 'Diagramme de flux mis à jour',
          flowGeneratedOn: 'Généré le {date}',
          flowTotalEmails: 'Basé sur {count} e-mails',
          mapPinClick:
            'Cliquez sur une épingle pour sélectionner un lieu, puis utilisez le bouton pour explorer les e-mails associés',
          mapGenerate: 'Générer la carte',
          mapRegenerate: 'Régénérer la carte',
          mapNoGraph: 'Aucune carte des lieux',
          mapNoGraphDesc:
            'Cliquez sur "Générer la carte" pour placer sur une vraie carte les lieux mentionnés dans vos e-mails.',
          mapError: 'Échec de la génération de la carte des lieux',
          mapLoadError: 'Échec du chargement de la carte des lieux',
          mapGenerated: 'Carte des lieux mise à jour',
          mapGeneratedOn: 'Générée le {date}',
          mapTotalEmails: 'Basé sur {count} e-mails',
        },
      },
      rules: {
        yourRules: 'Vos règles',
        active: 'Active',
        disabled: 'Désactivée',
        appliedTopToBottom: 'Les règles sont appliquées de haut en bas.',
        useArrows: "Utilisez les flèches pour changer l'ordre.",
        addARule: 'Créer règle',
        newRule: 'Nouvelle règle',
        ruleName: 'Nom de la règle',
        ruleDescription: 'Description de la règle',
        hideFilters: 'Masquer les filtres',
        addFilters: 'Ajouter des filtres expéditeur/objet/corps (optionnel)',
        editFilters: 'Modifier les filtres expéditeur/objet/corps (optionnel)',
        filterHelp:
          "Appliquer cette règle uniquement lorsque l'e-mail correspond à tous les modèles fournis (contient, insensible à la casse). Laissez vide pour appliquer à tous les e-mails.",
        senderContains: 'Expéditeur contient',
        subjectContains: 'Objet contient',
        bodyContains: 'Corps contient',
        ruleNamePlaceholder: 'ex. Résumé de newsletter',
        ruleDescriptionPlaceholder:
          'Exemple : Résume les newsletters et supprime le contenu promotionnel. Conserve uniquement les articles et liens essentiels.',
        senderPlaceholder: 'ex. newsletter@exemple.com',
        subjectPlaceholder: 'ex. Digest hebdomadaire',
        bodyPlaceholder: 'ex. se désabonner',
        addRule: 'Ajouter la règle',
        cancel: 'Annuler',
        saveChanges: 'Enregistrer les modifications',
        noRulesYet: 'Aucune règle. Ajoutez votre première règle ci-dessus !',
        exampleRule: 'Exemple : "Supprimer les publicités et résumer les newsletters"',
        sender: 'Expéditeur :',
        subject: 'Objet :',
        body: 'Corps :',
        updated: 'Mis à jour',
        moveRuleUp: 'Déplacer la règle vers le haut',
        moveRuleDown: 'Déplacer la règle vers le bas',
        processingOrder: 'Ordre de traitement',
        edit: 'Modifier',
        delete: 'Supprimer',
        deleteRule: 'Supprimer la règle',
        deleteConfirm: 'Êtes-vous sûr de vouloir supprimer',
        cannotBeUndone: 'Cette action est irréversible.',
        close: 'Fermer',
        searchPlaceholder: 'Rechercher des règles…',
        noMatchingRules: 'Aucune règle ne correspond à votre recherche.',
        ruleCreated: 'Règle créée',
        ruleSaved: 'Règle sauvegardée',
        ruleEnabled: 'Règle activée',
        ruleDisabled: 'Règle désactivée',
        ruleDeleted: 'Règle supprimée',
        errors: {
          nameRequired: 'Le nom de la règle est obligatoire',
          textRequired: 'Le texte de la règle est obligatoire',
          nameTooLong: 'Le nom de la règle ne doit pas dépasser {max} caractères',
          textTooLong: 'La règle dépasse la longueur maximale de {max} caractères',
          failedToCreate: 'Échec de la création de la règle',
          failedToUpdate: 'Échec de la mise à jour de la règle',
          failedToDelete: 'Échec de la suppression de la règle',
          failedToReorder: 'Échec du réordonnancement des règles',
        },
      },
      pwaInstall: {
        title: "Ajouter Postino à votre écran d'accueil",
        description:
          "Bénéficiez d'un accès plus rapide et d'une meilleure expérience en installant l'application sur votre appareil.",
        howToTitle: 'Comment installer :',
        iosSafariStep1Pre: 'Appuyez sur le',
        iosSafariStep1Post: 'bouton Partager dans la barre du navigateur.',
        iosSafariStep2Pre: 'Appuyez sur',
        iosSafariStep2Bold: "Sur l'écran d'accueil",
        iosSafariStep3: 'Appuyez sur Ajouter dans le coin supérieur droit pour confirmer.',
        iosSafari26Step1Pre: 'Appuyez sur le',
        iosSafari26Step1Post: 'bouton dans la barre du navigateur.',
        iosSafari26Step2Pre: 'Appuyez sur',
        iosSafari26Step2Bold: 'Partager',
        iosSafari26Step2Post: 'dans le menu.',
        iosSafari26Step3Pre: 'Appuyez sur',
        iosSafari26Step3Bold: 'Plus',
        iosSafari26Step4Pre: 'Sélectionnez',
        iosSafari26Step4Bold: "Sur l'écran d'accueil",
        iosSafari26Step4Post: 'dans le menu. Faites défiler vers le bas si nécessaire.',
        iosSafari26iPadStep1Pre: 'Appuyez sur le',
        iosSafari26iPadStep1Post: 'bouton Partager dans la barre du navigateur.',
        iosChromeStep1Pre: 'Appuyez sur le',
        iosChromeStep1Post: 'bouton dans le coin supérieur droit.',
        iosChromeStep2Pre: 'Sélectionnez',
        iosChromeStep2Bold: "Sur l'écran d'accueil",
        iosChromeStep2Post: ' dans le menu. Faites défiler vers le bas si nécessaire.',
        iosChromeStep3: 'Appuyez sur Ajouter pour confirmer.',
        androidStep1Pre: 'Appuyez sur le',
        androidStep1Post: 'bouton de menu en haut à droite.',
        androidStep2Pre: 'Appuyez sur',
        androidStep2Bold: "Ajouter à l'écran d'accueil",
        androidStep3: 'Appuyez sur Ajouter pour confirmer.',
        installButton: "Installer l'app",
        notNow: 'Pas maintenant',
      },
      toasts: {
        settingSaved: 'Paramètre sauvegardé',
        failedToLoadStats: 'Échec du chargement des statistiques',
        failedToUpdateEmailSetting: "Échec de la mise à jour de l'adresse e-mail",
        failedToUpdateForwardingHeaderSetting: "Échec de la mise à jour de l'en-tête de transfert",
        failedToUpdateAiAnalysisOnlySetting:
          'Échec de la mise à jour du paramètre analyse IA uniquement',
        failedToUpdateAnalysisLanguageSetting: "Échec de la mise à jour de la langue d'analyse",
        analysisRefreshed: 'Analyse IA actualisée.',
        analysisRefreshFailed: "Impossible d'actualiser l'analyse IA.",
        downloadAttachmentFailed: 'Impossible de télécharger la pièce jointe.',
      },
      agent: {
        title: 'Agent de Mémoire',
        subtitle: 'Demandez-moi à propos de vos e-mails.',
        placeholder: 'Demandez par exemple "Quels newsletters ai-je reçus cette semaine ?"',
        inputPlaceholder: 'Demandez à propos de vos e-mails…',
        send: 'Envoyer',
        noAnswer: 'Aucune réponse trouvée.',
        errorFallback: "Quelque chose s'est mal passé. Veuillez réessayer.",
        sendHint: "L'IA peut faire des erreurs, vérifiez toujours.",
        clearConversation: 'Effacer la conversation',
        clearConfirmTitle: 'Effacer la conversation ?',
        clearConfirmDescription:
          'Cela supprimera tous les messages de la session en cours. Cette action est irréversible.',
        clearConfirmButton: 'Effacer',
        cancelClear: 'Annuler',
        expandFullPage: 'Pleine page',
        closeFullPage: 'Fermer',
        sourceEmails: 'E-mails sources',
        cta: {
          title: 'Votre agent IA est prêt',
          description: 'Demandez-moi à propos de vos e-mails.',
          button: 'Demandez-moi tout sur vos e-mails !',
        },
      },
    },
    emailOriginal: {
      back: 'Retour',
      originalEmail: 'E-mail original',
      from: 'De :',
      to: 'À :',
      cc: 'Cc :',
      bcc: 'Bcc :',
      subject: 'Objet :',
      received: 'Reçu :',
      emailContent: "Contenu de l'e-mail",
      openFullPageView: 'Pleine page',
      openFullPageViewAria: "Ouvrir l'e-mail en pleine page",
      noOriginalContent: 'Aucun contenu original enregistré.',
      closeFullPageView: 'Fermer la vue pleine page',
      attachments: 'Pièces jointes :',
      noAttachments: 'Aucune pièce jointe.',
      errors: {
        noPermission: "Vous n'avez pas la permission de voir cet e-mail.",
        notFound: 'E-mail introuvable.',
        failedToLoad: "Impossible de charger l'e-mail.",
      },
      admin: {
        currentSetup: 'Configuration actuelle',
        loadingModels: 'Chargement des modèles…',
        defaultModel: 'Modèle par défaut',
        searchModels: 'Rechercher des modèles...',
        noModelsFound: 'Aucun modèle trouvé.',
        processing: 'Traitement…',
        analyze: "Tester l'analyse IA",
        failedToAnalyze: "Impossible d'analyser l'e-mail.",
        analysisResult: 'Analyse IA :',
        extractedMarkdown: 'Markdown extrait :',
        modelUsed: 'Modèle utilisé :',
        reprocess: 'Retraiter',
        failedToReprocess: "Impossible de retraiter l'e-mail.",
        ruleApplied: 'Règle appliquée :',
        tokensUsed: 'Tokens utilisés :',
        estCost: 'Coût est. :',
        processedBody: 'Corps traité :',
      },
    },
    admin: {
      users: {
        rerunAnalysis: "Relancer l'analyse IA",
        rerunAnalysisTitle: "Relancer l'analyse IA",
        rerunAnalysisDesc:
          "Supprimer toute l'analyse IA enregistrée pour {email} et la relancer sur chaque e-mail de cette boîte ? Cela peut prendre un moment.",
        rerunAnalysisPreparing: 'Préparation…',
        rerunAnalysisProgress: '{done} / {total} e-mails ({percent}%)',
        rerunAnalysisRetry: 'Réessayer',
        resetData: 'Réinitialiser les données',
        resetDataTitle: 'Réinitialiser les données utilisateur',
        resetDataDesc:
          'Supprimer toutes les données stockées pour {email} et recréer un profil Postino vierge ? La connexion reste active, mais les e-mails, règles, tâches, connaissances et caches seront supprimés.',
      },
      toasts: {
        settingsSaved: 'Paramètres sauvegardés',
        failedToLoadStats: 'Échec du chargement des statistiques',
        failedToLoadChartData: 'Échec du chargement des données du graphique',
        userDeleted: 'Utilisateur supprimé',
        adminGranted: 'Droits administrateur accordés',
        adminRemoved: 'Droits administrateur retirés',
        userSuspended: 'Utilisateur suspendu',
        userActivated: 'Utilisateur activé',
        userAnalysesRerun: 'Analyse IA relancée pour {count} e-mails.',
        userAnalysesRerunPartial:
          'Analyse IA relancée pour {done} e-mails, {failed} échecs, {skipped} ignorés.',
        failedToRerunUserAnalyses: "Impossible de relancer l'analyse IA de l'utilisateur.",
        userDataReset: 'Données utilisateur réinitialisées',
        failedToResetUserData: 'Échec de la réinitialisation des données utilisateur',
        failedToUpdateUser: "Échec de la mise à jour de l'utilisateur",
        failedToProcessQueue: 'Échec du traitement du lot',
        failedToUpdateMailgunSetting: 'Échec de la mise à jour du paramètre Mailgun',
        failedToClearLogs: 'Échec de la suppression des journaux',
      },
    },
  },
  de: {
    nav: {
      signIn: 'Anmelden',
      getStarted: 'Loslegen',
      signOut: 'Abmelden',
      dashboard: 'Dashboard',
      admin: 'Admin',
      allRightsReserved: 'Alle Rechte vorbehalten.',
    },
    language: {
      select: 'Sprache',
    },
    home: {
      hero: {
        words: ['fasst zusammen', 'organisiert', 'übersetzt', 'verfeinert'],
        emailsAndNewsletters: 'E-Mails & Newsletter',
        subtitle:
          'Erhalten Sie eine private E-Mail-Adresse.\nSchreiben Sie einfache Regeln in natürlicher Sprache.\nPostinos KI verarbeitet Ihre eingehenden E-Mails — fasst Newsletter zusammen, entfernt Werbung, extrahiert wichtige Infos und vieles mehr — und leitet das Ergebnis an Sie weiter.',
        startFree: 'Kostenlos starten',
        howItWorks: 'Wie es funktioniert',
      },
      howItWorks: {
        title: 'Wie es funktioniert',
        step1: {
          title: 'Ihre Adresse erhalten',
          desc: 'Registrieren Sie sich und erhalten Sie eine einzigartige Postino-E-Mail-Adresse wie amber-2026@postino.pro',
        },
        step2: {
          title: 'Regeln schreiben',
          desc: 'Sagen Sie Postino, was zu tun ist: "Newsletter zusammenfassen", "Werbeinhalte entfernen", usw.',
        },
        step3: {
          title: 'Verarbeitete E-Mails empfangen',
          desc: 'Postino verarbeitet eingehende E-Mails mit KI und leitet saubere, nützliche Inhalte an Ihr Postfach weiter.',
        },
      },
      exampleRules: {
        title: 'Beispielregeln',
        rules: [
          'Newsletter zusammenfassen und alle Werbung und Werbeinhalte entfernen',
          'Nur die wichtigen Aktionspunkte aus E-Mails extrahieren und auflisten',
          'E-Mails ins Deutsche übersetzen und die wichtigsten Punkte zusammenfassen',
          'Für Quittungen und Bestellbestätigungen nur die Bestelldetails und den Gesamtbetrag extrahieren',
          'Tracking-Pixel entfernen und Links bereinigen',
          'Wenn die E-Mail ein Werbeangebot ist, sie vollständig ignorieren',
        ],
      },
      blog: {
        title: 'Postino Blog',
        subtitle: 'Tipps, Updates und Einblicke vom Postino-Team',
        readMore: 'Mehr lesen',
        backToBlog: 'Zurück zum Blog',
        cta: {
          title: 'Lesen Sie unseren Blog',
          subtitle:
            'Entdecken Sie Tipps, Anleitungen und Updates zur KI-gestützten E-Mail-Verwaltung.',
          button: 'Artikel erkunden',
        },
      },
    },
    auth: {
      login: {
        welcomeBack: 'Willkommen zurück',
        signInToAccount: 'Melden Sie sich bei Ihrem Konto an',
        emailAddress: 'E-Mail-Adresse',
        password: 'Passwort',
        forgotPassword: 'Passwort vergessen?',
        signIn: 'Anmelden',
        noAccount: 'Kein Konto?',
        signUp: 'Registrieren',
        errors: {
          invalidCredential: 'Ungültige E-Mail oder ungültiges Passwort',
          tooManyRequests:
            'Zu viele fehlgeschlagene Versuche. Bitte versuchen Sie es später erneut.',
          failed: 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.',
          suspended: 'Ihr Konto wurde gesperrt. Bitte kontaktieren Sie den Support.',
          emailNotVerified: 'Bitte bestätigen Sie Ihre E-Mail-Adresse, bevor Sie sich anmelden.',
        },
      },
      register: {
        createAccount: 'Konto erstellen',
        getYourAddress: 'Erhalten Sie Ihre persönliche Postino-Adresse',
        emailAddress: 'E-Mail-Adresse',
        password: 'Passwort',
        minChars: 'Mind. 8 Zeichen',
        confirmPassword: 'Passwort bestätigen',
        repeatPassword: 'Passwort wiederholen',
        alreadyHaveAccount: 'Haben Sie bereits ein Konto?',
        signIn: 'Anmelden',
        button: 'Konto erstellen',
        maintenanceMessage:
          'Wir arbeiten an der Verbesserung des Dienstes. Neue Benutzerregistrierungen sind während der Wartung ausgesetzt. Bitte versuchen Sie es später erneut.',
        errors: {
          passwordsMismatch: 'Passwörter stimmen nicht überein',
          passwordTooShort: 'Das Passwort muss mindestens 8 Zeichen lang sein',
          emailAlreadyInUse: 'Es existiert bereits ein Konto mit dieser E-Mail',
          weakPassword: 'Das Passwort ist zu schwach',
          blockedDomain: 'Sie können kein Konto mit unseren E-Mail-Adressen erstellen',
          failed: 'Kontoerstellung fehlgeschlagen. Bitte versuchen Sie es erneut.',
        },
      },
      forgotPassword: {
        title: 'Passwort zurücksetzen',
        subtitle: 'Geben Sie Ihre E-Mail ein, um einen Reset-Link zu erhalten',
        emailAddress: 'E-Mail-Adresse',
        sendResetLink: 'Reset-Link senden',
        rememberedPassword: 'Passwort erinnert?',
        backToSignIn: 'Zurück zur Anmeldung',
        successMessage:
          'Falls ein Konto für diese E-Mail existiert, haben wir Ihnen einen Link zum Zurücksetzen des Passworts gesendet.',
        errors: {
          invalidEmail: 'Ungültige E-Mail-Adresse',
          tooManyAttempts: 'Zu viele Versuche. Bitte versuchen Sie es später erneut.',
          failed: 'Senden der Reset-E-Mail fehlgeschlagen. Bitte versuchen Sie es erneut.',
        },
      },
      dashboardLink: {
        alreadySignedIn: 'Sie sind bereits angemeldet.',
        goToDashboard: 'Zum Dashboard',
        loadingDashboard: 'Dashboard wird geladen…',
      },
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Verwalten Sie Ihre Postino-Adresse und E-Mail-Regeln',
      tabs: {
        overview: 'Übersicht',
        myRules: 'Meine Regeln',
        emailHistory: 'E-Mail-Verlauf',
        inbox: 'Posteingang',
        explore: 'Erkunden',
        relations: 'Beziehungen',
        settings: 'Einstellungen',
        agent: 'Speicher',
      },
      address: {
        title: 'Ihre Postino-Adresse',
        active: 'Aktiv',
        disabled: 'Deaktiviert',
        activeDescription:
          'Senden Sie E-Mails an diese Adresse und sie werden gemäß Ihren Regeln verarbeitet, dann an Ihre E-Mail weitergeleitet',
        disabledDescription:
          'Ihre Postino-Adresse ist deaktiviert. Eingehende E-Mails werden als übersprungen registriert und nicht weitergeleitet.',
        copy: 'Kopieren',
        copied: 'Kopiert',
        toggleAriaLabel: 'Ihre Postino-Adresse aktivieren oder deaktivieren',
        aiAnalysisOnly: 'Nur KI-Analyse',
        aiAnalysisOnlyEnabledDescription:
          'Eingehende E-Mails werden von der KI analysiert und im Speicher abgelegt, aber Regeln und Weiterleitung werden übersprungen.',
        aiAnalysisOnlyDisabledDescription:
          'Aktivieren, um E-Mails mit KI zu analysieren und den Speicher zu aktualisieren, auch wenn die Weiterleitung deaktiviert ist.',
        aiAnalysisOnlyToggleAriaLabel: 'Nur-KI-Analyse-Modus aktivieren oder deaktivieren',
      },
      stats: {
        emailsReceived: 'Empfangene E-Mails',
        emailsForwarded: 'Weitergeleitete E-Mails',
        emailsErrored: 'Fehlerhafte E-Mails',
        emailsSkipped: 'Übersprungene E-Mails',
        tokensUsed: 'Verwendete Tokens',
        estCost: 'Gesch. Kosten',
        period: 'Zeitraum',
        last24h: 'Letzte 24h',
        last7days: 'Letzte 7 Tage',
        lastMonth: 'Letzter Monat',
        allTime: 'Gesamt',
      },
      pushNotifications: {
        title: 'Push-Benachrichtigungen',
        enabledDescription:
          'Sie erhalten eine Browserbenachrichtigung, sobald eine E-Mail verarbeitet wird.',
        disabledDescription:
          'Aktivieren Sie, um eine Browserbenachrichtigung bei jeder neuen E-Mail-Verarbeitung zu erhalten.',
        blockedDescription:
          'Benachrichtigungen sind von Ihrem Browser blockiert. Öffnen Sie die Website-Einstellungen in Ihrem Browser und erlauben Sie Benachrichtigungen, um diese Funktion zu aktivieren.',
      },
      forwardingHeader: {
        title: 'Postino-Kopfzeile in weitergeleiteten E-Mails',
        enabledDescription:
          'Eine Postino-Zusammenfassungsbox wird am Ende jeder weitergeleiteten E-Mail eingefügt.',
        disabledDescription:
          'Die Postino-Zusammenfassungsbox wird nicht zu weitergeleiteten E-Mails hinzugefügt.',
      },
      analysisLanguage: {
        title: 'Sprache der KI-Analyse',
        description:
          'Wählen Sie die Sprache für KI-generierte Analyseinhalte (Zusammenfassung, Absicht, Tags, Themen). Wählen Sie „Auto" für Englisch (Standard).',
        selectPlaceholder: 'Sprache auswählen',
        autoLabel: 'Auto (Englisch)',
      },
      installApp: {
        title: 'Postino-App installieren',
        description:
          'Installieren Sie Postino als App auf Ihrem Gerät für ein schnelleres, natives Erlebnis.',
        buttonLabel: 'App installieren',
        alreadyInstalled: 'Bereits installiert',
      },
      deleteEntities: {
        title: 'Alle Entitäten und Zusammenführungen löschen',
        description:
          'Löscht dauerhaft alle extrahierten Entitäten (Personen, Themen, Organisationen, Orte, Ereignisse, Tags) aus Ihren E-Mails, alle Entitätszusammenführungen und alle KI-Zusammenführungsvorschläge. Diese Aktion kann nicht rückgängig gemacht werden.',
        buttonLabel: 'Alle Entitäten und Zusammenführungen löschen',
        confirmTitle: 'Alle Entitäten und Zusammenführungen löschen?',
        confirmDescription:
          'Dadurch werden alle extrahierten Entitäten aus Ihren E-Mails, alle Zusammenführungen und KI-Zusammenführungsvorschläge dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
        cancel: 'Abbrechen',
        confirmButton: 'Alles löschen',
        successToast: 'Alle Entitätsdaten gelöscht.',
        errorToast: 'Entitätsdaten konnten nicht gelöscht werden.',
      },
      clearAnalysis: {
        title: 'Alle KI-Analysen löschen',
        description:
          'Entfernt alle KI-generierten Analysen, verarbeiteten Inhalte, Token-Nutzung und Kostendaten aus Ihren E-Mails. Nur die Originalnachrichten bleiben erhalten. Löscht auch alle Entitäten, Zusammenführungen und gecachten Graphen. Diese Aktion kann nicht rückgängig gemacht werden.',
        buttonLabel: 'Alle KI-Analysen löschen',
        confirmTitle: 'Alle KI-Analysen löschen?',
        confirmDescription:
          'Dadurch werden alle KI-Analysen, verarbeiteten Inhalte, Token-Nutzung, Entitäten, Zusammenführungen und gecachten Graphen aus Ihren E-Mails dauerhaft gelöscht. Nur die Originalnachrichten bleiben erhalten. Diese Aktion kann nicht rückgängig gemacht werden.',
        cancel: 'Abbrechen',
        confirmButton: 'Alle Analysen löschen',
        successToast: 'Alle KI-Analysedaten gelöscht.',
        errorToast: 'KI-Analysedaten konnten nicht gelöscht werden.',
      },
      resetUsageStats: {
        title: 'Kosten- und Token-Statistiken zurücksetzen',
        description:
          'Setzt alle gespeicherten Token- und geschätzten Kostenwerte Ihrer verarbeiteten E-Mails auf null zurück. Die E-Mails selbst werden nicht gelöscht.',
        buttonLabel: 'Kosten- und Token-Statistiken zurücksetzen',
        confirmTitle: 'Kosten- und Token-Statistiken zurücksetzen?',
        confirmDescription:
          'Dadurch werden alle gespeicherten Token- und geschätzten Kostenwerte Ihrer verarbeiteten E-Mails auf null zurückgesetzt. Diese Aktion kann nicht rückgängig gemacht werden.',
        cancel: 'Abbrechen',
        confirmButton: 'Statistiken zurücksetzen',
        successToast: 'Kosten- und Token-Statistiken zurückgesetzt.',
        errorToast: 'Kosten- und Token-Statistiken konnten nicht zurückgesetzt werden.',
      },
      clearMemories: {
        title: 'Alle Erinnerungen löschen',
        description:
          'Löscht dauerhaft alle gespeicherten Erinnerungen, einschließlich des lokalen Verlaufs und der Supermemory-Daten, wenn diese konfiguriert sind. Diese Aktion kann nicht rückgängig gemacht werden.',
        buttonLabel: 'Alle Erinnerungen löschen',
        confirmTitle: 'Alle Erinnerungen löschen?',
        confirmDescription:
          'Dadurch werden alle Ihre gespeicherten Erinnerungen dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
        cancel: 'Abbrechen',
        confirmButton: 'Erinnerungen löschen',
        successToast: 'Alle Erinnerungen gelöscht.',
        errorToast: 'Erinnerungen konnten nicht gelöscht werden.',
      },
      charts: {
        myEmailVolume: 'Mein E-Mail-Volumen',
        received: 'Empfangen',
        processing: 'In Bearbeitung',
        forwarded: 'Weitergeleitet',
        error: 'Fehler',
        skipped: 'Übersprungen',
        estimatedCost: 'Geschätzte Kosten',
        estCost: 'Gesch. Kosten',
        last24h: 'Letzte 24h',
        last7days: 'Letzte 7 Tage',
        last30days: 'Letzte 30 Tage',
        perHour: 'Pro Stunde',
        perDay: 'Pro Tag',
        perWeek: 'Pro Woche',
        weekOf: 'Woche vom',
      },
      emailHistory: {
        allStatuses: 'Alle Status',
        filterByStatus: 'Nach Status filtern',
        refresh: 'Aktualisieren',
        showPostinoHeader: 'Postino-Kopfzeile in weitergeleiteten E-Mails anzeigen',
        noEmailsWithStatus: 'Keine E-Mails mit Status',
        clearFilter: 'Filter entfernen',
        noEmailsYet: 'Noch keine E-Mails verarbeitet.',
        noEmailsYetDesc: 'Senden Sie eine E-Mail an Ihre Postino-Adresse, um zu beginnen!',
        selectEmailToRead: 'E-Mail zum Lesen auswählen',
        from: 'Von:',
        to: 'An:',
        cc: 'Cc:',
        bcc: 'Bcc:',
        attachments: 'Anhänge:',
        downloadAttachment: 'Anhang herunterladen',
        noAttachmentsShort: 'Keine',
        ruleApplied: 'Angewendete Regel:',
        tokens: 'Tokens:',
        viewOriginal: 'Original-E-Mail anzeigen',
        viewFullPage: 'Vollbild',
        loadingEmail: 'E-Mail wird geladen…',
        searchPlaceholder: 'E-Mails suchen…',
        withAttachments: 'Mit Anhängen',
        applyFilters: 'Suchen',
        results: 'Ergebnisse',
        messages: 'Nachrichten',
        previous: 'Zurück',
        next: 'Weiter',
        page: 'Seite',
        of: 'von',
        aiAnalysis: 'KI-Analyse',
        tabSummary: 'Details',
        tabContent: 'Inhalt',
        tabAiAnalysis: 'KI',
        noAiAnalysis: 'Keine KI-Analyse verfügbar.',
        analysisType: 'Typ:',
        analysisSentiment: 'Stimmung:',
        analysisPriority: 'Priorität:',
        analysisLanguage: 'Sprache:',
        analysisSenderType: 'Absendertyp:',
        analysisIntent: 'Absicht:',
        analysisTags: 'Tags:',
        analysisTopics: 'Themen:',
        analysisRequiresResponse: 'Antwort erforderlich',
        analysisEntitiesPeople: 'Personen:',
        analysisEntitiesOrganizations: 'Organisationen:',
        analysisEntitiesPlaces: 'Orte:',
        analysisEntitiesEvents: 'Ereignisse:',
        analysisEntitiesDates: 'Daten:',
        analysisEntitiesPrices: 'Preise:',
        rerunAnalysis: 'Analyse wiederholen',
        rerunningAnalysis: 'Analyse wird wiederholt...',
        deleteEmail: 'E-Mail löschen',
        deleteEmailConfirm:
          'Möchten Sie diese E-Mail wirklich dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
        deleteEmailSuccess: 'E-Mail gelöscht.',
        deleteEmailError: 'E-Mail konnte nicht gelöscht werden.',
        failedToLoad: 'E-Mails konnten nicht geladen werden',
        failedToLoadCount: 'Anzahl der E-Mails konnte nicht geladen werden',
      },
      search: {
        title: 'E-Mails suchen',
        toggleFilters: 'Filter ein-/ausblenden',
        searchPlaceholder: 'Nach Betreff, Absender, Zusammenfassung, Tags suchen…',
        applyFilters: 'Suchen',
        noResults: 'Keine E-Mails entsprechen den Filtern.',
        filterStatus: 'Status',
        filterSentiment: 'Stimmung',
        filterCategory: 'Kategorie',
        filterPriority: 'Priorität',
        filterSenderType: 'Absendertyp',
        filterLanguage: 'Sprache',
        filterTags: 'Tags',
        filterPeople: 'Personen',
        filterOrgs: 'Organisationen',
        filterPlaces: 'Orte',
        filterEvents: 'Ereignisse',
        filterNumbers: 'Nummern & Codes',
        languagePlaceholder: 'Sprache auswählen…',
        tagsPlaceholder: 'Tags auswählen…',
        peoplePlaceholder: 'Personen auswählen…',
        orgsPlaceholder: 'Organisationen auswählen…',
        placesPlaceholder: 'Orte auswählen…',
        eventsPlaceholder: 'Ereignisse auswählen…',
        numbersPlaceholder: 'Nummern/Codes auswählen…',
        advancedFilters: 'Erweiterte Filter',
        withAttachments: 'Mit Anhängen',
        requiresResponse: 'Antwort erforderlich',
        hasActionItems: 'Hat Aufgaben',
        isUrgent: 'Dringend',
        allSentiments: 'Alle Stimmungen',
        sentimentPositive: 'Positiv',
        sentimentNeutral: 'Neutral',
        sentimentNegative: 'Negativ',
        allCategories: 'Alle Kategorien',
        typeNewsletter: 'Newsletter',
        typeTransactional: 'Transaktional',
        typePromotional: 'Werblich',
        typePersonal: 'Persönlich',
        typeNotification: 'Benachrichtigung',
        typeAutomated: 'Automatisiert',
        typeOther: 'Sonstiges',
        allPriorities: 'Alle Prioritäten',
        priorityLow: 'Niedrig',
        priorityNormal: 'Normal',
        priorityHigh: 'Hoch',
        priorityCritical: 'Kritisch',
        allSenderTypes: 'Alle Typen',
        senderHuman: 'Mensch',
        senderAutomated: 'Automatisiert',
        senderBusiness: 'Unternehmen',
        senderNewsletter: 'Newsletter',
      },
      knowledge: {
        title: 'E-Mails erkunden',
        subtitle: 'Erkunden Sie Themen, Personen und Organisationen aus Ihren E-Mails',
        allCategories: 'Alle',
        topics: 'Themen',
        people: 'Personen',
        organizations: 'Organisationen',
        places: 'Orte',
        events: 'Ereignisse',
        tags: 'Tags',
        numbers: 'Nummern & Codes',
        emailsAnalyzed: '{count} E-Mails analysiert',
        noData: 'Keine Wissensdaten vorhanden',
        noDataDesc:
          'Senden Sie E-Mails an Ihre Postino-Adresse, um Ihren Wissensgraphen aufzubauen.',
        searchInInbox: 'In Posteingang suchen',
        loading: 'Laden…',
        mentions: 'Erwähnungen',
        relatedEmails: 'Verwandte E-Mails',
        relatedEmailsDesc: 'E-Mails mit Erwähnung von',
        noRelatedEmails: 'Keine E-Mails für diesen Begriff gefunden.',
        merge: 'Zusammenführen',
        mergeMode: 'Zum Zusammenführen auswählen',
        cancelMerge: 'Abbrechen',
        mergeSelected: 'Auswahl zusammenführen',
        mergeDialogTitle: 'Entitäten zusammenführen',
        mergeDialogDesc: 'Diese Entitäten werden zu einer zusammengefasst.',
        canonicalName: 'Kanonischer Name',
        canonicalNamePlaceholder: 'Anzuzeigender Name',
        mergeChipHint: 'Klicken Sie auf einen Namen, um ihn als kanonischen Namen zu verwenden',
        createMerge: 'Zusammenführung erstellen',
        mergeSameCategoryWarning: 'Wählen Sie 2 oder mehr Entitäten der gleichen Kategorie aus.',
        manageMerges: 'Zusammenführungen verwalten',
        noMerges: 'Keine Zusammenführungen definiert.',
        deleteMerge: 'Zusammenführung löschen',
        deleteConfirm: 'Sind Sie sicher, dass Sie löschen möchten',
        mergesTitle: 'Entitätszusammenführungen',
        mergesDesc:
          'Zusammengeführte Entitäten werden in der Wissensansicht als ein Element angezeigt.',
        listTab: 'Liste',
        mergedTab: 'Zusammengeführt',
        suggestionsTab: 'Vorschläge',
        xSelected: '{count} ausgewählt',
        mergedFrom: 'Zusammengeführt aus',
        mergeCreated: 'Zusammenführung erstellt',
        mergeDeleted: 'Zusammenführung gelöscht',
        cannotBeUndone: 'Diese Aktion kann nicht rückgängig gemacht werden.',
        suggestionsAskAI: 'KI nach Vorschlägen fragen',
        suggestionsAskAIDesc:
          'Die KI analysiert Ihre Entitäten und schlägt mögliche Zusammenführungen vor.',
        suggestionsGenerating: 'Vorschläge werden generiert…',
        suggestionsEmpty: 'Keine Vorschläge',
        suggestionsEmptyDesc:
          'Klicken Sie auf die Schaltfläche, um die KI nach Zusammenführungsvorschlägen zu fragen.',
        suggestionsAccept: 'Akzeptieren',
        suggestionsReject: 'Ablehnen',
        suggestionsCompleteFirst: 'Beenden Sie alle Vorschläge, bevor Sie neue generieren.',
        suggestionsError: 'Vorschläge konnten nicht generiert werden. Bitte erneut versuchen.',
        failedToLoad: 'Daten konnten nicht geladen werden',
        failedToLoadMerges: 'Zusammenführungen konnten nicht geladen werden',
        failedToLoadSuggestions: 'Vorschläge konnten nicht geladen werden',
        suggestionsGenerated: 'Vorschläge generiert',
        relations: {
          viewToggle: 'Beziehungskarte',
          exploreToggle: 'Erkunden',
          title: 'Beziehungskarte',
          subtitle: 'Verbindungen zwischen Entitäten in Ihren E-Mails',
          generate: 'Beziehungen generieren',
          generating: 'Generierung…',
          regenerate: 'Neu generieren',
          noGraph: 'Keine Beziehungskarte',
          noGraphDesc:
            'Klicken Sie auf "Beziehungen generieren", um Verbindungen zwischen Entitäten in Ihren E-Mails zu entdecken.',
          generatedOn: 'Erstellt am {date}',
          totalEmails: 'Basierend auf {count} E-Mails',
          error: 'Beziehungen konnten nicht generiert werden',
          nodeClickHint: 'Knoten auswählen, um Verbindungen hervorzuheben',
          nodeClickHint2: 'Verwenden Sie die Schaltfläche, um zugehörige E-Mails zu erkunden',
          openRelatedEmails: 'Zugehörige E-Mails öffnen',
          expandFullPage: 'Vollbild',
          closeFullPage: 'Schließen',
          legend: 'Legende',
          loadError: 'Beziehungskarte konnte nicht geladen werden',
          generated: 'Beziehungsgraph aktualisiert',
          graphTab: 'Graph',
          flowTab: 'Fluss',
          mapTab: 'Karte',
          flowNodeClick:
            'Klicken Sie einmal, um verbundene Entitäten hervorzuheben, und verwenden Sie dann die Schaltfläche, um zugehörige E-Mails zu erkunden',
          flowGenerate: 'Fluss generieren',
          flowGenerating: 'Generierung…',
          flowRegenerate: 'Fluss neu generieren',
          flowNoGraph: 'Kein Flussdiagramm vorhanden',
          flowNoGraphDesc:
            'Klicken Sie auf "Fluss generieren", um zu sehen, wie sich Entitäten über die Zeit entwickelt haben.',
          flowError: 'Flussdiagramm konnte nicht generiert werden',
          flowLoadError: 'Flussdiagramm konnte nicht geladen werden',
          flowGenerated: 'Flussdiagramm aktualisiert',
          flowGeneratedOn: 'Erstellt am {date}',
          flowTotalEmails: 'Basierend auf {count} E-Mails',
          mapPinClick:
            'Klicken Sie auf einen Pin, um einen Ort auszuwählen, und verwenden Sie dann die Schaltfläche, um zugehörige E-Mails zu erkunden',
          mapGenerate: 'Karte generieren',
          mapRegenerate: 'Karte neu generieren',
          mapNoGraph: 'Noch keine Ortskarte',
          mapNoGraphDesc:
            'Klicken Sie auf "Karte generieren", um die in Ihren E-Mails erwähnten Orte auf einer echten Karte zu platzieren.',
          mapError: 'Ortskarte konnte nicht generiert werden',
          mapLoadError: 'Ortskarte konnte nicht geladen werden',
          mapGenerated: 'Ortskarte aktualisiert',
          mapGeneratedOn: 'Erstellt am {date}',
          mapTotalEmails: 'Basierend auf {count} E-Mails',
        },
      },
      rules: {
        yourRules: 'Ihre Regeln',
        active: 'Aktiv',
        disabled: 'Deaktiviert',
        appliedTopToBottom: 'Regeln werden von oben nach unten angewendet.',
        useArrows: 'Verwenden Sie die Pfeile, um die Reihenfolge zu ändern.',
        addARule: 'Regel erstellen',
        newRule: 'Neue Regel',
        ruleName: 'Regelname',
        ruleDescription: 'Regelbeschreibung',
        hideFilters: 'Filter ausblenden',
        addFilters: 'Absender-/Betreff-/Text-Filter hinzufügen (optional)',
        editFilters: 'Absender-/Betreff-/Text-Filter bearbeiten (optional)',
        filterHelp:
          'Diese Regel nur anwenden, wenn die eingehende E-Mail allen angegebenen Mustern entspricht (enthält, Groß-/Kleinschreibung ignoriert). Leer lassen, um auf alle E-Mails anzuwenden.',
        senderContains: 'Absender enthält',
        subjectContains: 'Betreff enthält',
        bodyContains: 'Text enthält',
        ruleNamePlaceholder: 'z. B. Newsletter-Zusammenfassung',
        ruleDescriptionPlaceholder:
          'Beispiel: Fasse Newsletter zusammen und entferne Werbeinhalte. Behalte nur die wichtigsten Artikel und Links.',
        senderPlaceholder: 'z. B. newsletter@beispiel.com',
        subjectPlaceholder: 'z. B. Wöchentlicher Digest',
        bodyPlaceholder: 'z. B. abbestellen',
        addRule: 'Regel hinzufügen',
        cancel: 'Abbrechen',
        saveChanges: 'Änderungen speichern',
        noRulesYet: 'Noch keine Regeln. Fügen Sie Ihre erste Regel oben hinzu!',
        exampleRule: 'Beispiel: „Werbung entfernen und Newsletter zusammenfassen"',
        sender: 'Absender:',
        subject: 'Betreff:',
        body: 'Text:',
        updated: 'Aktualisiert',
        moveRuleUp: 'Regel nach oben verschieben',
        moveRuleDown: 'Regel nach unten verschieben',
        processingOrder: 'Verarbeitungsreihenfolge',
        edit: 'Bearbeiten',
        delete: 'Löschen',
        deleteRule: 'Regel löschen',
        deleteConfirm: 'Sind Sie sicher, dass Sie löschen möchten',
        cannotBeUndone: 'Diese Aktion kann nicht rückgängig gemacht werden.',
        close: 'Schließen',
        searchPlaceholder: 'Regeln suchen…',
        noMatchingRules: 'Keine Regeln entsprechen Ihrer Suche.',
        ruleCreated: 'Regel erstellt',
        ruleSaved: 'Regel gespeichert',
        ruleEnabled: 'Regel aktiviert',
        ruleDisabled: 'Regel deaktiviert',
        ruleDeleted: 'Regel gelöscht',
        errors: {
          nameRequired: 'Regelname ist erforderlich',
          textRequired: 'Regeltext ist erforderlich',
          nameTooLong: 'Regelname darf höchstens {max} Zeichen lang sein',
          textTooLong: 'Regel überschreitet die maximale Länge von {max} Zeichen',
          failedToCreate: 'Regel konnte nicht erstellt werden',
          failedToUpdate: 'Regel konnte nicht aktualisiert werden',
          failedToDelete: 'Regel konnte nicht gelöscht werden',
          failedToReorder: 'Regeln konnten nicht neu geordnet werden',
        },
      },
      pwaInstall: {
        title: 'Postino zum Startbildschirm hinzufügen',
        description:
          'Erhalten Sie schnelleren Zugriff und eine bessere Erfahrung, indem Sie die App auf Ihrem Gerät installieren.',
        howToTitle: 'So installieren Sie:',
        iosSafariStep1Pre: 'Tippen Sie auf die',
        iosSafariStep1Post: 'Teilen-Schaltfläche in der Browser-Symbolleiste.',
        iosSafariStep2Pre: 'Tippen Sie auf',
        iosSafariStep2Bold: 'Zum Home-Bildschirm',
        iosSafariStep3: 'Tippen Sie zur Bestätigung auf Hinzufügen in der oberen rechten Ecke.',
        iosSafari26Step1Pre: 'Tippen Sie auf die',
        iosSafari26Step1Post: 'Schaltfläche in der Browser-Symbolleiste.',
        iosSafari26Step2Pre: 'Tippen Sie auf',
        iosSafari26Step2Bold: 'Teilen',
        iosSafari26Step2Post: 'im Menü.',
        iosSafari26Step3Pre: 'Tippen Sie auf',
        iosSafari26Step3Bold: 'Mehr',
        iosSafari26Step4Pre: 'Wählen Sie',
        iosSafari26Step4Bold: 'Zum Startbildschirm',
        iosSafari26Step4Post: 'aus dem Menü. Möglicherweise müssen Sie nach unten scrollen.',
        iosSafari26iPadStep1Pre: 'Tippen Sie auf die',
        iosSafari26iPadStep1Post: 'Teilen-Schaltfläche in der Browser-Symbolleiste.',
        iosChromeStep1Pre: 'Tippen Sie auf die',
        iosChromeStep1Post: 'Schaltfläche in der oberen rechten Ecke.',
        iosChromeStep2Pre: 'Wählen Sie',
        iosChromeStep2Bold: 'Zum Home-Bildschirm',
        iosChromeStep2Post: ' aus dem Menü. Möglicherweise müssen Sie nach unten scrollen.',
        iosChromeStep3: 'Tippen Sie auf Hinzufügen zur Bestätigung.',
        androidStep1Pre: 'Tippen Sie auf die',
        androidStep1Post: 'Menü-Schaltfläche oben rechts.',
        androidStep2Pre: 'Tippen Sie auf',
        androidStep2Bold: 'Zum Startbildschirm hinzufügen',
        androidStep3: 'Tippen Sie auf Hinzufügen zur Bestätigung.',
        installButton: 'App installieren',
        notNow: 'Nicht jetzt',
      },
      toasts: {
        settingSaved: 'Einstellung gespeichert',
        failedToLoadStats: 'Statistiken konnten nicht geladen werden',
        failedToUpdateEmailSetting: 'E-Mail-Adresseinstellung konnte nicht aktualisiert werden',
        failedToUpdateForwardingHeaderSetting:
          'Weiterleitungsheader-Einstellung konnte nicht aktualisiert werden',
        failedToUpdateAiAnalysisOnlySetting:
          'Einstellung für nur KI-Analyse konnte nicht aktualisiert werden',
        failedToUpdateAnalysisLanguageSetting: 'Analysesprache konnte nicht aktualisiert werden',
        analysisRefreshed: 'KI-Analyse aktualisiert.',
        analysisRefreshFailed: 'KI-Analyse konnte nicht aktualisiert werden.',
        downloadAttachmentFailed: 'Anhang konnte nicht heruntergeladen werden.',
      },
      agent: {
        title: 'Gedächtnis-Agent',
        subtitle: 'Fragen Sie mich zu Ihren E-Mails.',
        placeholder: 'Fragen Sie z.B. "Welche Newsletter habe ich diese Woche erhalten?"',
        inputPlaceholder: 'Fragen Sie zu Ihren E-Mails…',
        send: 'Senden',
        noAnswer: 'Keine Antwort gefunden.',
        errorFallback: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
        sendHint: 'KI kann Fehler machen, immer überprüfen.',
        clearConversation: 'Konversation löschen',
        clearConfirmTitle: 'Konversation löschen?',
        clearConfirmDescription:
          'Dadurch werden alle Nachrichten der aktuellen Sitzung entfernt. Diese Aktion kann nicht rückgängig gemacht werden.',
        clearConfirmButton: 'Löschen',
        cancelClear: 'Abbrechen',
        expandFullPage: 'Vollbild',
        closeFullPage: 'Schließen',
        sourceEmails: 'Quell-E-Mails',
        cta: {
          title: 'Ihr KI-E-Mail-Agent ist bereit',
          description: 'Fragen Sie mich zu Ihren E-Mails.',
          button: 'Fragen Sie mich alles über Ihre E-Mails!',
        },
      },
    },
    emailOriginal: {
      back: 'Zurück',
      originalEmail: 'Original-E-Mail',
      from: 'Von:',
      to: 'An:',
      cc: 'Cc:',
      bcc: 'Bcc:',
      subject: 'Betreff:',
      received: 'Empfangen:',
      emailContent: 'E-Mail-Inhalt',
      openFullPageView: 'Vollbild',
      openFullPageViewAria: 'E-Mail im Vollbild öffnen',
      noOriginalContent: 'Kein Originalinhalt gespeichert.',
      closeFullPageView: 'Vollbildansicht schließen',
      attachments: 'Anhänge:',
      noAttachments: 'Keine Anhänge.',
      errors: {
        noPermission: 'Sie haben keine Berechtigung, diese E-Mail anzuzeigen.',
        notFound: 'E-Mail nicht gefunden.',
        failedToLoad: 'E-Mail konnte nicht geladen werden.',
      },
      admin: {
        currentSetup: 'Aktuelle Konfiguration',
        loadingModels: 'Modelle werden geladen…',
        defaultModel: 'Standardmodell',
        searchModels: 'Modelle suchen...',
        noModelsFound: 'Keine Modelle gefunden.',
        processing: 'Verarbeitung…',
        analyze: 'KI-Analyse testen',
        failedToAnalyze: 'E-Mail konnte nicht analysiert werden.',
        analysisResult: 'KI-Analyse:',
        extractedMarkdown: 'Extrahiertes Markdown:',
        modelUsed: 'Verwendetes Modell:',
        reprocess: 'Neu verarbeiten',
        failedToReprocess: 'E-Mail konnte nicht neu verarbeitet werden.',
        ruleApplied: 'Angewendete Regel:',
        tokensUsed: 'Verwendete Tokens:',
        estCost: 'Gesch. Kosten:',
        processedBody: 'Verarbeiteter Inhalt:',
      },
    },
    admin: {
      users: {
        rerunAnalysis: 'KI-Analyse neu starten',
        rerunAnalysisTitle: 'KI-Analyse neu starten',
        rerunAnalysisDesc:
          'Die gesamte gespeicherte KI-Analyse für {email} löschen und für jede E-Mail in diesem Postfach neu ausführen? Das kann etwas dauern.',
        rerunAnalysisPreparing: 'Wird vorbereitet…',
        rerunAnalysisProgress: '{done} / {total} E-Mails ({percent}%)',
        rerunAnalysisRetry: 'Wiederholen',
        resetData: 'Daten zurücksetzen',
        resetDataTitle: 'Benutzerdaten zurücksetzen',
        resetDataDesc:
          'Alle gespeicherten Daten von {email} löschen und ein frisches Postino-Profil bereitstellen? Der Login bleibt aktiv, aber E-Mails, Regeln, Jobs, Wissen und Caches werden entfernt.',
      },
      toasts: {
        settingsSaved: 'Einstellungen gespeichert',
        failedToLoadStats: 'Statistiken konnten nicht geladen werden',
        failedToLoadChartData: 'Diagrammdaten konnten nicht geladen werden',
        userDeleted: 'Benutzer gelöscht',
        adminGranted: 'Administratorrechte gewährt',
        adminRemoved: 'Administratorrechte entfernt',
        userSuspended: 'Benutzer gesperrt',
        userActivated: 'Benutzer aktiviert',
        userAnalysesRerun: 'KI-Analyse für {count} E-Mails aktualisiert.',
        userAnalysesRerunPartial:
          'KI-Analyse für {done} E-Mails aktualisiert, {failed} fehlgeschlagen, {skipped} übersprungen.',
        failedToRerunUserAnalyses: 'KI-Analyse des Benutzers konnte nicht neu gestartet werden.',
        userDataReset: 'Benutzerdaten zurückgesetzt',
        failedToResetUserData: 'Benutzerdaten konnten nicht zurückgesetzt werden',
        failedToUpdateUser: 'Benutzer konnte nicht aktualisiert werden',
        failedToProcessQueue: 'Warteschlangen-Batch konnte nicht verarbeitet werden',
        failedToUpdateMailgunSetting: 'Mailgun-Einstellung konnte nicht aktualisiert werden',
        failedToClearLogs: 'Protokolle konnten nicht gelöscht werden',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Helper: detect browser locale → supported Locale
// ---------------------------------------------------------------------------
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language || '';
  const primary = lang.split('-')[0].toLowerCase();
  const supported: Locale[] = ['en', 'it', 'es', 'fr', 'de'];
  return supported.includes(primary as Locale) ? (primary as Locale) : 'en';
}

function getStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem('locale') as Locale | null;
    const supported: Locale[] = ['en', 'it', 'es', 'fr', 'de'];
    return stored && supported.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: translations.en,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = getStoredLocale();

    setLocaleState(stored ?? detectLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem('locale', next);
    } catch {
      // ignore
    }
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
