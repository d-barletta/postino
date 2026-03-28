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
    };
  };
  dashboard: {
    title: string;
    subtitle: string;
    tabs: {
      overview: string;
      myRules: string;
      emailHistory: string;
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
    };
    stats: {
      emailsReceived: string;
      emailsForwarded: string;
      emailsErrored: string;
      emailsSkipped: string;
      tokensUsed: string;
      estCost: string;
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
      from: string;
      to: string;
      cc: string;
      attachments: string;
      noAttachmentsShort: string;
      ruleApplied: string;
      tokens: string;
      viewOriginal: string;
      viewFullPage: string;
      loadingEmail: string;
      searchPlaceholder: string;
      withAttachments: string;
      previous: string;
      next: string;
      page: string;
      of: string;
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
      errors: {
        nameRequired: string;
        textRequired: string;
        nameTooLong: string;
        textTooLong: string;
        failedToCreate: string;
        failedToUpdate: string;
      };
    };
    pwaInstall: {
      title: string;
      description: string;
      iosTitle: string;
      iosStep1Pre: string;
      iosStep1Bold: string;
      iosStep1Post: string;
      iosStep2Pre: string;
      iosStep2Bold: string;
      iosStep3: string;
      installButton: string;
      notNow: string;
    };
  };
  emailOriginal: {
    back: string;
    originalEmail: string;
    from: string;
    to: string;
    cc: string;
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
      reprocess: string;
      failedToReprocess: string;
      ruleApplied: string;
      tokensUsed: string;
      estCost: string;
      processedBody: string;
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
          'Get a private email address.\nWrite simple rules in natural language.\nPostino\'s AI processes your incoming emails — summarizing newsletters, removing ads, extracting key info, translate and much more — then forwards the result to you.',
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
        successMessage:
          'If an account exists for this email, we sent you a password reset link.',
        errors: {
          invalidEmail: 'Invalid email address',
          tooManyAttempts: 'Too many attempts. Please try again later.',
          failed: 'Failed to send reset email. Please try again.',
        },
      },
      dashboardLink: {
        alreadySignedIn: 'You are already signed in.',
        goToDashboard: 'Go to Dashboard',
      },
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Manage your Postino address and email rules',
      tabs: {
        overview: 'Overview',
        myRules: 'My Rules',
        emailHistory: 'Email History',
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
      },
      stats: {
        emailsReceived: 'Emails Received',
        emailsForwarded: 'Emails Forwarded',
        emailsErrored: 'Emails Errored',
        emailsSkipped: 'Emails Skipped',
        tokensUsed: 'Tokens Used',
        estCost: 'Est. Cost',
      },
      pushNotifications: {
        title: 'Push Notifications',
        enabledDescription: 'You will receive a browser notification each time an email is processed.',
        disabledDescription: 'Enable to receive a browser notification whenever a new email is processed.',
        blockedDescription: "Notifications are blocked by your browser. Open your browser's site settings and allow notifications for this site to enable this feature.",
      },
      forwardingHeader: {
        title: 'Postino Header in Forwarded Emails',
        enabledDescription: 'A Postino summary box is appended to the bottom of every forwarded email.',
        disabledDescription: 'The Postino summary box is not appended to forwarded emails.',
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
        clearFilter: 'Clear filter',
        noEmailsYet: 'No emails processed yet.',
        noEmailsYetDesc: 'Send an email to your Postino address to get started!',
        from: 'From:',
        to: 'To:',
        cc: 'Cc:',
        attachments: 'Attachments:',
        noAttachmentsShort: 'None',
        ruleApplied: 'Rule applied:',
        tokens: 'Tokens:',
        viewOriginal: 'View original email',
        viewFullPage: 'Full page',
        loadingEmail: 'Loading email…',
        searchPlaceholder: 'Search emails…',
        withAttachments: 'With attachments',
        previous: 'Previous',
        next: 'Next',
        page: 'Page',
        of: 'of',
      },
      rules: {
        yourRules: 'Your Rules',
        active: 'Active',
        disabled: 'Disabled',
        appliedTopToBottom: 'Rules are applied top to bottom.',
        useArrows: 'Use the arrows to change the order.',
        addARule: 'Add a rule',
        newRule: 'New Rule',
        ruleName: 'Rule Name',
        ruleDescription: 'Rule Description',
        hideFilters: 'Hide filters',
        addFilters: 'Add sender/subject/body filters (optional)',
        editFilters: 'Edit sender/subject/body filters (optional)',
        filterHelp: 'Apply this rule only when the incoming email matches all provided patterns (case-insensitive contains). Leave blank to apply to all emails.',
        senderContains: 'Sender contains',
        subjectContains: 'Subject contains',
        bodyContains: 'Body contains',
        ruleNamePlaceholder: 'e.g. Newsletter Summarizer',
        ruleDescriptionPlaceholder: 'Example: Summarize newsletters and remove promotional content. Keep only the key articles and links.',
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
        errors: {
          nameRequired: 'Rule name is required',
          textRequired: 'Rule text is required',
          nameTooLong: 'Rule name must be at most {max} characters',
          textTooLong: 'Rule exceeds maximum length of {max} characters',
          failedToCreate: 'Failed to create rule',
          failedToUpdate: 'Failed to update rule',
        },
      },
      pwaInstall: {
        title: 'Add Postino to your home screen',
        description: 'Get faster access and a better experience by installing the app on your device.',
        iosTitle: 'To install on iOS:',
        iosStep1Pre: 'Tap the',
        iosStep1Bold: 'Share',
        iosStep1Post: 'button (the box with an arrow pointing up) in the browser toolbar.',
        iosStep2Pre: 'Scroll down and tap',
        iosStep2Bold: '"Add to Home Screen"',
        iosStep3: 'Tap "Add" in the top-right corner to confirm.',
        installButton: 'Install app',
        notNow: 'Not now',
      },
    },
    emailOriginal: {
      back: 'Back',
      originalEmail: 'Original Email',
      from: 'From:',
      to: 'To:',
      cc: 'Cc:',
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
        reprocess: 'Re-process',
        failedToReprocess: 'Failed to reprocess email.',
        ruleApplied: 'Rule applied:',
        tokensUsed: 'Tokens used:',
        estCost: 'Est. cost:',
        processedBody: 'Processed body:',
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
          'Estrai ed elenca solo gli elementi d\'azione importanti dalle email',
          'Traduci le email in italiano e riassumi i punti principali',
          'Per ricevute e conferme d\'ordine, estrai solo i dettagli dell\'ordine e il totale',
          'Rimuovi i pixel di tracciamento e riscrivi i link in modo pulito',
          'Se l\'email è un\'offerta promozionale, ignorala completamente',
        ],
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
        backToSignIn: 'Torna all\'accesso',
        successMessage:
          'Se esiste un account per questa email, ti abbiamo inviato un link per reimpostare la password.',
        errors: {
          invalidEmail: 'Indirizzo email non valido',
          tooManyAttempts: 'Troppi tentativi. Riprova più tardi.',
          failed: 'Invio email di reimpostazione non riuscito. Riprova.',
        },
      },
      dashboardLink: {
        alreadySignedIn: 'Hai già effettuato l\'accesso.',
        goToDashboard: 'Vai alla Dashboard',
      },
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Gestisci il tuo indirizzo Postino e le regole email',
      tabs: {
        overview: 'Panoramica',
        myRules: 'Le mie regole',
        emailHistory: 'Cronologia email',
      },
      address: {
        title: 'Il tuo indirizzo Postino',
        active: 'Attivo',
        disabled: 'Disabilitato',
        activeDescription:
          'Invia email a questo indirizzo e verranno elaborate secondo le tue regole, poi inoltrate alla tua email',
        disabledDescription:
          "Il tuo indirizzo Postino è disabilitato. Le email in arrivo verranno registrate come saltate e non inoltrate.",
        copy: 'Copia',
        copied: 'Copiato',
        toggleAriaLabel: 'Abilita o disabilita il tuo indirizzo Postino',
      },
      stats: {
        emailsReceived: 'Email ricevute',
        emailsForwarded: 'Email inoltrate',
        emailsErrored: 'Email con errori',
        emailsSkipped: 'Email saltate',
        tokensUsed: 'Token usati',
        estCost: 'Costo stimato',
      },
      pushNotifications: {
        title: 'Notifiche push',
        enabledDescription: "Riceverai una notifica del browser ogni volta che un'email viene elaborata.",
        disabledDescription: "Attiva per ricevere una notifica del browser ogni volta che una nuova email viene elaborata.",
        blockedDescription: "Le notifiche sono bloccate dal browser. Apri le impostazioni del sito nel browser e consenti le notifiche per abilitare questa funzione.",
      },
      forwardingHeader: {
        title: 'Intestazione Postino nelle email inoltrate',
        enabledDescription: 'Un riquadro di riepilogo Postino viene aggiunto in fondo a ogni email inoltrata.',
        disabledDescription: 'Il riquadro di riepilogo Postino non viene aggiunto alle email inoltrate.',
      },
      charts: {
        myEmailVolume: 'Il mio volume di email',
        received: 'Ricevute',
        processing: 'In elaborazione',
        forwarded: 'Inoltrate',
        error: 'Errore',
        skipped: 'Saltate',
        estimatedCost: 'Costo stimato',
        estCost: 'Costo est.',
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
        clearFilter: 'Rimuovi filtro',
        noEmailsYet: 'Nessuna email elaborata.',
        noEmailsYetDesc: "Invia un'email al tuo indirizzo Postino per iniziare!",
        from: 'Da:',
        to: 'A:',
        cc: 'Cc:',
        attachments: 'Allegati:',
        noAttachmentsShort: 'Nessuno',
        ruleApplied: 'Regola applicata:',
        tokens: 'Token:',
        viewOriginal: 'Visualizza email originale',
        viewFullPage: 'Pagina intera',
        loadingEmail: 'Caricamento email…',
        searchPlaceholder: 'Cerca email…',
        withAttachments: 'Con allegati',
        previous: 'Precedente',
        next: 'Successivo',
        page: 'Pagina',
        of: 'di',
      },
      rules: {
        yourRules: 'Le tue regole',
        active: 'Attiva',
        disabled: 'Disabilitata',
        appliedTopToBottom: "Le regole vengono applicate dall'alto verso il basso.",
        useArrows: "Usa le frecce per cambiare l'ordine.",
        addARule: 'Aggiungi una regola',
        newRule: 'Nuova regola',
        ruleName: 'Nome regola',
        ruleDescription: 'Descrizione regola',
        hideFilters: 'Nascondi filtri',
        addFilters: 'Aggiungi filtri mittente/oggetto/corpo (opzionale)',
        editFilters: 'Modifica filtri mittente/oggetto/corpo (opzionale)',
        filterHelp: "Applica questa regola solo quando l'email corrisponde a tutti i pattern forniti (contiene, senza distinzione maiuscole/minuscole). Lascia vuoto per applicare a tutte le email.",
        senderContains: 'Mittente contiene',
        subjectContains: 'Oggetto contiene',
        bodyContains: 'Corpo contiene',
        ruleNamePlaceholder: 'es. Riepilogo newsletter',
        ruleDescriptionPlaceholder: 'Esempio: Riassumi le newsletter e rimuovi i contenuti promozionali. Mantieni solo gli articoli e i link principali.',
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
        errors: {
          nameRequired: 'Il nome della regola è obbligatorio',
          textRequired: 'Il testo della regola è obbligatorio',
          nameTooLong: 'Il nome della regola deve essere al massimo {max} caratteri',
          textTooLong: 'La regola supera la lunghezza massima di {max} caratteri',
          failedToCreate: 'Creazione regola non riuscita',
          failedToUpdate: 'Aggiornamento regola non riuscito',
        },
      },
      pwaInstall: {
        title: 'Aggiungi Postino alla schermata home',
        description: "Ottieni un accesso più rapido e un'esperienza migliore installando l'app sul tuo dispositivo.",
        iosTitle: 'Per installare su iOS:',
        iosStep1Pre: 'Tocca il pulsante',
        iosStep1Bold: 'Condividi',
        iosStep1Post: "(la casella con una freccia rivolta verso l'alto) nella barra degli strumenti del browser.",
        iosStep2Pre: 'Scorri verso il basso e tocca',
        iosStep2Bold: '"Aggiungi a schermata Home"',
        iosStep3: "Tocca «Aggiungi» nell'angolo in alto a destra per confermare.",
        installButton: 'Installa app',
        notNow: 'Non ora',
      },
    },
    emailOriginal: {
      back: 'Indietro',
      originalEmail: 'Email originale',
      from: 'Da:',
      to: 'A:',
      cc: 'Cc:',
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
        reprocess: 'Rielabora',
        failedToReprocess: "Impossibile rielaborare l'email.",
        ruleApplied: 'Regola applicata:',
        tokensUsed: 'Token usati:',
        estCost: 'Costo est.:',
        processedBody: 'Corpo elaborato:',
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
      },
    },
    dashboard: {
      title: 'Panel',
      subtitle: 'Administra tu dirección Postino y las reglas de correo',
      tabs: {
        overview: 'Resumen',
        myRules: 'Mis Reglas',
        emailHistory: 'Historial de correos',
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
      },
      stats: {
        emailsReceived: 'Correos recibidos',
        emailsForwarded: 'Correos reenviados',
        emailsErrored: 'Correos con error',
        emailsSkipped: 'Correos omitidos',
        tokensUsed: 'Tokens usados',
        estCost: 'Coste est.',
      },
      pushNotifications: {
        title: 'Notificaciones push',
        enabledDescription: 'Recibirás una notificación del navegador cada vez que se procese un correo.',
        disabledDescription: 'Activa para recibir una notificación del navegador cada vez que se procese un nuevo correo.',
        blockedDescription: 'Las notificaciones están bloqueadas por tu navegador. Abre la configuración del sitio en tu navegador y permite las notificaciones para habilitar esta función.',
      },
      forwardingHeader: {
        title: 'Encabezado Postino en correos reenviados',
        enabledDescription: 'Un cuadro de resumen de Postino se añade al final de cada correo reenviado.',
        disabledDescription: 'El cuadro de resumen de Postino no se añade a los correos reenviados.',
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
        clearFilter: 'Borrar filtro',
        noEmailsYet: 'Aún no se han procesado correos.',
        noEmailsYetDesc: '¡Envía un correo a tu dirección Postino para empezar!',
        from: 'De:',
        to: 'Para:',
        cc: 'Cc:',
        attachments: 'Adjuntos:',
        noAttachmentsShort: 'Ninguno',
        ruleApplied: 'Regla aplicada:',
        tokens: 'Tokens:',
        viewOriginal: 'Ver correo original',
        viewFullPage: 'Página completa',
        loadingEmail: 'Cargando correo…',
        searchPlaceholder: 'Buscar correos…',
        withAttachments: 'Con adjuntos',
        previous: 'Anterior',
        next: 'Siguiente',
        page: 'Página',
        of: 'de',
      },
      rules: {
        yourRules: 'Tus reglas',
        active: 'Activa',
        disabled: 'Desactivada',
        appliedTopToBottom: 'Las reglas se aplican de arriba hacia abajo.',
        useArrows: 'Usa las flechas para cambiar el orden.',
        addARule: 'Añadir una regla',
        newRule: 'Nueva regla',
        ruleName: 'Nombre de la regla',
        ruleDescription: 'Descripción de la regla',
        hideFilters: 'Ocultar filtros',
        addFilters: 'Añadir filtros de remitente/asunto/cuerpo (opcional)',
        editFilters: 'Editar filtros de remitente/asunto/cuerpo (opcional)',
        filterHelp: 'Aplica esta regla solo cuando el correo coincida con todos los patrones proporcionados (contiene, sin distinción de mayúsculas). Deja en blanco para aplicar a todos los correos.',
        senderContains: 'Remitente contiene',
        subjectContains: 'Asunto contiene',
        bodyContains: 'Cuerpo contiene',
        ruleNamePlaceholder: 'ej. Resumen de newsletter',
        ruleDescriptionPlaceholder: 'Ejemplo: Resume las newsletters y elimina el contenido promocional. Conserva solo los artículos y enlaces clave.',
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
        errors: {
          nameRequired: 'El nombre de la regla es obligatorio',
          textRequired: 'El texto de la regla es obligatorio',
          nameTooLong: 'El nombre de la regla no puede superar {max} caracteres',
          textTooLong: 'La regla supera la longitud máxima de {max} caracteres',
          failedToCreate: 'Error al crear la regla',
          failedToUpdate: 'Error al actualizar la regla',
        },
      },
      pwaInstall: {
        title: 'Añadir Postino a tu pantalla de inicio',
        description: 'Obtén un acceso más rápido y una mejor experiencia instalando la app en tu dispositivo.',
        iosTitle: 'Para instalar en iOS:',
        iosStep1Pre: 'Toca el botón',
        iosStep1Bold: 'Compartir',
        iosStep1Post: '(el cuadro con una flecha apuntando hacia arriba) en la barra de herramientas del navegador.',
        iosStep2Pre: 'Desplázate hacia abajo y toca',
        iosStep2Bold: '"Añadir a pantalla de inicio"',
        iosStep3: 'Toca "Añadir" en la esquina superior derecha para confirmar.',
        installButton: 'Instalar app',
        notNow: 'Ahora no',
      },
    },
    emailOriginal: {
      back: 'Volver',
      originalEmail: 'Correo original',
      from: 'De:',
      to: 'Para:',
      cc: 'Cc:',
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
        reprocess: 'Reprocesar',
        failedToReprocess: 'No se pudo reprocesar el correo.',
        ruleApplied: 'Regla aplicada:',
        tokensUsed: 'Tokens usados:',
        estCost: 'Coste est.:',
        processedBody: 'Cuerpo procesado:',
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
          "Pour les reçus et confirmations de commande, extraire uniquement les détails de la commande et le total",
          'Supprimer les pixels de suivi et réécrire les liens proprement',
          "Si l'e-mail est une offre promotionnelle, l'ignorer complètement",
        ],
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
          "Nous améliorons le service. Les nouvelles inscriptions sont suspendues pendant la maintenance. Veuillez réessayer plus tard.",
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
          "Si un compte existe pour cet e-mail, nous vous avons envoyé un lien de réinitialisation du mot de passe.",
        errors: {
          invalidEmail: 'Adresse e-mail invalide',
          tooManyAttempts: 'Trop de tentatives. Veuillez réessayer plus tard.',
          failed: "Échec de l'envoi de l'e-mail de réinitialisation. Veuillez réessayer.",
        },
      },
      dashboardLink: {
        alreadySignedIn: 'Vous êtes déjà connecté.',
        goToDashboard: 'Aller au tableau de bord',
      },
    },
    dashboard: {
      title: 'Tableau de bord',
      subtitle: 'Gérez votre adresse Postino et vos règles e-mail',
      tabs: {
        overview: 'Vue d\'ensemble',
        myRules: 'Mes règles',
        emailHistory: 'Historique des e-mails',
      },
      address: {
        title: 'Votre adresse Postino',
        active: 'Active',
        disabled: 'Désactivée',
        activeDescription:
          "Envoyez des e-mails à cette adresse et ils seront traités selon vos règles, puis transmis à votre e-mail",
        disabledDescription:
          "Votre adresse Postino est désactivée. Les e-mails entrants seront enregistrés comme ignorés et ne seront pas transmis.",
        copy: 'Copier',
        copied: 'Copié',
        toggleAriaLabel: 'Activer ou désactiver votre adresse Postino',
      },
      stats: {
        emailsReceived: 'E-mails reçus',
        emailsForwarded: 'E-mails transmis',
        emailsErrored: 'E-mails en erreur',
        emailsSkipped: 'E-mails ignorés',
        tokensUsed: 'Tokens utilisés',
        estCost: 'Coût est.',
      },
      pushNotifications: {
        title: 'Notifications push',
        enabledDescription: "Vous recevrez une notification du navigateur chaque fois qu'un e-mail est traité.",
        disabledDescription: "Activez pour recevoir une notification du navigateur à chaque nouveau traitement d'e-mail.",
        blockedDescription: "Les notifications sont bloquées par votre navigateur. Ouvrez les paramètres du site dans votre navigateur et autorisez les notifications pour activer cette fonctionnalité.",
      },
      forwardingHeader: {
        title: 'En-tête Postino dans les e-mails transmis',
        enabledDescription: 'Un encadré récapitulatif Postino est ajouté au bas de chaque e-mail transmis.',
        disabledDescription: "L'encadré récapitulatif Postino n'est pas ajouté aux e-mails transmis.",
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
        clearFilter: 'Effacer le filtre',
        noEmailsYet: "Aucun e-mail traité pour l'instant.",
        noEmailsYetDesc: 'Envoyez un e-mail à votre adresse Postino pour commencer !',
        from: 'De :',
        to: 'À :',
        cc: 'Cc :',
        attachments: 'Pièces jointes :',
        noAttachmentsShort: 'Aucune',
        ruleApplied: 'Règle appliquée :',
        tokens: 'Tokens :',
        viewOriginal: "Voir l'e-mail original",
        viewFullPage: 'Pleine page',
        loadingEmail: "Chargement de l'e-mail\u2026",
        searchPlaceholder: 'Rechercher des e-mails…',
        withAttachments: 'Avec pièces jointes',
        previous: 'Précédent',
        next: 'Suivant',
        page: 'Page',
        of: 'sur',
      },
      rules: {
        yourRules: 'Vos règles',
        active: 'Active',
        disabled: 'Désactivée',
        appliedTopToBottom: 'Les règles sont appliquées de haut en bas.',
        useArrows: "Utilisez les flèches pour changer l'ordre.",
        addARule: 'Ajouter une règle',
        newRule: 'Nouvelle règle',
        ruleName: 'Nom de la règle',
        ruleDescription: 'Description de la règle',
        hideFilters: 'Masquer les filtres',
        addFilters: 'Ajouter des filtres expéditeur/objet/corps (optionnel)',
        editFilters: 'Modifier les filtres expéditeur/objet/corps (optionnel)',
        filterHelp: "Appliquer cette règle uniquement lorsque l'e-mail correspond à tous les modèles fournis (contient, insensible à la casse). Laissez vide pour appliquer à tous les e-mails.",
        senderContains: 'Expéditeur contient',
        subjectContains: 'Objet contient',
        bodyContains: 'Corps contient',
        ruleNamePlaceholder: 'ex. Résumé de newsletter',
        ruleDescriptionPlaceholder: "Exemple : Résume les newsletters et supprime le contenu promotionnel. Conserve uniquement les articles et liens essentiels.",
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
        errors: {
          nameRequired: 'Le nom de la règle est obligatoire',
          textRequired: 'Le texte de la règle est obligatoire',
          nameTooLong: 'Le nom de la règle ne doit pas dépasser {max} caractères',
          textTooLong: 'La règle dépasse la longueur maximale de {max} caractères',
          failedToCreate: 'Échec de la création de la règle',
          failedToUpdate: 'Échec de la mise à jour de la règle',
        },
      },
      pwaInstall: {
        title: "Ajouter Postino à votre écran d'accueil",
        description: "Bénéficiez d'un accès plus rapide et d'une meilleure expérience en installant l'application sur votre appareil.",
        iosTitle: 'Pour installer sur iOS :',
        iosStep1Pre: 'Appuyez sur le bouton',
        iosStep1Bold: 'Partager',
        iosStep1Post: "(la case avec une flèche vers le haut) dans la barre d'outils du navigateur.",
        iosStep2Pre: 'Faites défiler vers le bas et appuyez sur',
        iosStep2Bold: "« Sur l'écran d'accueil »",
        iosStep3: 'Appuyez sur « Ajouter » dans le coin supérieur droit pour confirmer.',
        installButton: "Installer l'app",
        notNow: 'Pas maintenant',
      },
    },
    emailOriginal: {
      back: 'Retour',
      originalEmail: 'E-mail original',
      from: 'De :',
      to: 'À :',
      cc: 'Cc :',
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
        reprocess: 'Retraiter',
        failedToReprocess: "Impossible de retraiter l'e-mail.",
        ruleApplied: 'Règle appliquée :',
        tokensUsed: 'Tokens utilisés :',
        estCost: 'Coût est. :',
        processedBody: 'Corps traité :',
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
          tooManyRequests: 'Zu viele fehlgeschlagene Versuche. Bitte versuchen Sie es später erneut.',
          failed: 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.',
          suspended: 'Ihr Konto wurde gesperrt. Bitte kontaktieren Sie den Support.',
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
      },
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Verwalten Sie Ihre Postino-Adresse und E-Mail-Regeln',
      tabs: {
        overview: 'Übersicht',
        myRules: 'Meine Regeln',
        emailHistory: 'E-Mail-Verlauf',
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
      },
      stats: {
        emailsReceived: 'Empfangene E-Mails',
        emailsForwarded: 'Weitergeleitete E-Mails',
        emailsErrored: 'Fehlerhafte E-Mails',
        emailsSkipped: 'Übersprungene E-Mails',
        tokensUsed: 'Verwendete Tokens',
        estCost: 'Gesch. Kosten',
      },
      pushNotifications: {
        title: 'Push-Benachrichtigungen',
        enabledDescription: 'Sie erhalten eine Browserbenachrichtigung, sobald eine E-Mail verarbeitet wird.',
        disabledDescription: 'Aktivieren Sie, um eine Browserbenachrichtigung bei jeder neuen E-Mail-Verarbeitung zu erhalten.',
        blockedDescription: 'Benachrichtigungen sind von Ihrem Browser blockiert. Öffnen Sie die Website-Einstellungen in Ihrem Browser und erlauben Sie Benachrichtigungen, um diese Funktion zu aktivieren.',
      },
      forwardingHeader: {
        title: 'Postino-Kopfzeile in weitergeleiteten E-Mails',
        enabledDescription: 'Eine Postino-Zusammenfassungsbox wird am Ende jeder weitergeleiteten E-Mail eingefügt.',
        disabledDescription: 'Die Postino-Zusammenfassungsbox wird nicht zu weitergeleiteten E-Mails hinzugefügt.',
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
        clearFilter: 'Filter löschen',
        noEmailsYet: 'Noch keine E-Mails verarbeitet.',
        noEmailsYetDesc: 'Senden Sie eine E-Mail an Ihre Postino-Adresse, um zu beginnen!',
        from: 'Von:',
        to: 'An:',
        cc: 'Cc:',
        attachments: 'Anhänge:',
        noAttachmentsShort: 'Keine',
        ruleApplied: 'Angewendete Regel:',
        tokens: 'Tokens:',
        viewOriginal: 'Original-E-Mail anzeigen',
        viewFullPage: 'Vollbild',
        loadingEmail: 'E-Mail wird geladen…',
        searchPlaceholder: 'E-Mails suchen…',
        withAttachments: 'Mit Anhängen',
        previous: 'Zurück',
        next: 'Weiter',
        page: 'Seite',
        of: 'von',
      },
      rules: {
        yourRules: 'Ihre Regeln',
        active: 'Aktiv',
        disabled: 'Deaktiviert',
        appliedTopToBottom: 'Regeln werden von oben nach unten angewendet.',
        useArrows: 'Verwenden Sie die Pfeile, um die Reihenfolge zu ändern.',
        addARule: 'Regel hinzufügen',
        newRule: 'Neue Regel',
        ruleName: 'Regelname',
        ruleDescription: 'Regelbeschreibung',
        hideFilters: 'Filter ausblenden',
        addFilters: 'Absender-/Betreff-/Text-Filter hinzufügen (optional)',
        editFilters: 'Absender-/Betreff-/Text-Filter bearbeiten (optional)',
        filterHelp: 'Diese Regel nur anwenden, wenn die eingehende E-Mail allen angegebenen Mustern entspricht (enthält, Groß-/Kleinschreibung ignoriert). Leer lassen, um auf alle E-Mails anzuwenden.',
        senderContains: 'Absender enthält',
        subjectContains: 'Betreff enthält',
        bodyContains: 'Text enthält',
        ruleNamePlaceholder: 'z. B. Newsletter-Zusammenfassung',
        ruleDescriptionPlaceholder: 'Beispiel: Fasse Newsletter zusammen und entferne Werbeinhalte. Behalte nur die wichtigsten Artikel und Links.',
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
        errors: {
          nameRequired: 'Regelname ist erforderlich',
          textRequired: 'Regeltext ist erforderlich',
          nameTooLong: 'Regelname darf höchstens {max} Zeichen lang sein',
          textTooLong: 'Regel überschreitet die maximale Länge von {max} Zeichen',
          failedToCreate: 'Regel konnte nicht erstellt werden',
          failedToUpdate: 'Regel konnte nicht aktualisiert werden',
        },
      },
      pwaInstall: {
        title: 'Postino zum Startbildschirm hinzufügen',
        description: 'Erhalten Sie schnelleren Zugriff und eine bessere Erfahrung, indem Sie die App auf Ihrem Gerät installieren.',
        iosTitle: 'So installieren Sie auf iOS:',
        iosStep1Pre: 'Tippen Sie auf die Schaltfläche',
        iosStep1Bold: 'Teilen',
        iosStep1Post: '(das Feld mit einem nach oben zeigenden Pfeil) in der Browser-Symbolleiste.',
        iosStep2Pre: 'Scrollen Sie nach unten und tippen Sie auf',
        iosStep2Bold: '„Zum Home-Bildschirm"',
        iosStep3: 'Tippen Sie zur Bestätigung auf „Hinzufügen" in der oberen rechten Ecke.',
        installButton: 'App installieren',
        notNow: 'Nicht jetzt',
      },
    },
    emailOriginal: {
      back: 'Zurück',
      originalEmail: 'Original-E-Mail',
      from: 'Von:',
      to: 'An:',
      cc: 'Cc:',
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
        reprocess: 'Neu verarbeiten',
        failedToReprocess: 'E-Mail konnte nicht neu verarbeitet werden.',
        ruleApplied: 'Angewendete Regel:',
        tokensUsed: 'Verwendete Tokens:',
        estCost: 'Gesch. Kosten:',
        processedBody: 'Verarbeiteter Inhalt:',
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
