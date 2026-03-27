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
    };
    stats: {
      emailsReceived: string;
      emailsForwarded: string;
      emailsErrored: string;
      emailsSkipped: string;
      tokensUsed: string;
      estCost: string;
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
      },
      stats: {
        emailsReceived: 'Emails Received',
        emailsForwarded: 'Emails Forwarded',
        emailsErrored: 'Emails Errored',
        emailsSkipped: 'Emails Skipped',
        tokensUsed: 'Tokens Used',
        estCost: 'Est. Cost',
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
      },
      stats: {
        emailsReceived: 'Email ricevute',
        emailsForwarded: 'Email inoltrate',
        emailsErrored: 'Email con errori',
        emailsSkipped: 'Email saltate',
        tokensUsed: 'Token usati',
        estCost: 'Costo stimato',
      },
    },
  },

  // -------------------------------------------------------------------------
  // es – Español
  // -------------------------------------------------------------------------
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
      },
      stats: {
        emailsReceived: 'Correos recibidos',
        emailsForwarded: 'Correos reenviados',
        emailsErrored: 'Correos con error',
        emailsSkipped: 'Correos omitidos',
        tokensUsed: 'Tokens usados',
        estCost: 'Coste est.',
      },
    },
  },

  // -------------------------------------------------------------------------
  // fr – Français
  // -------------------------------------------------------------------------
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
      },
      stats: {
        emailsReceived: 'E-mails reçus',
        emailsForwarded: 'E-mails transmis',
        emailsErrored: 'E-mails en erreur',
        emailsSkipped: 'E-mails ignorés',
        tokensUsed: 'Tokens utilisés',
        estCost: 'Coût est.',
      },
    },
  },

  // -------------------------------------------------------------------------
  // de – Deutsch
  // -------------------------------------------------------------------------
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
      },
      stats: {
        emailsReceived: 'Empfangene E-Mails',
        emailsForwarded: 'Weitergeleitete E-Mails',
        emailsErrored: 'Fehlerhafte E-Mails',
        emailsSkipped: 'Übersprungene E-Mails',
        tokensUsed: 'Verwendete Tokens',
        estCost: 'Gesch. Kosten',
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
