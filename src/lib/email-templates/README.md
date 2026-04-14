# Postino Email Templates

This folder contains self-contained HTML email templates for Supabase authentication flows. All templates are ready to be pasted directly into Supabase email template bodies—no external resources needed.

## Template Overview

Each template includes:

- ✓ Postino logo (embedded SVG) centered at the top
- ✓ Centered card design with main content
- ✓ Postino branding (accent yellow: `#efd957`)
- ✓ Clean typography using system fonts
- ✓ Responsive design for mobile & desktop

## Templates

### 1. **confirm-signup.html**

- **Purpose:** Ask users to confirm their email address after signing up
- **Variables:** `{{ .ConfirmationURL }}`
- **Flow:** Email confirmation during registration

### 2. **invite-user.html**

- **Purpose:** Invite users who don't have an account to sign up
- **Variables:** `{{ .SiteURL }}`, `{{ .ConfirmationURL }}`
- **Flow:** User invitation/onboarding

### 3. **magic-link.html**

- **Purpose:** Allow users to sign in via a one-time link sent to their email
- **Variables:** `{{ .ConfirmationURL }}`
- **Flow:** Passwordless authentication

### 4. **change-email.html**

- **Purpose:** Ask users to verify their new email address after changing it
- **Variables:** `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .ConfirmationURL }}`
- **Flow:** Email address change verification

### 5. **reset-password.html**

- **Purpose:** Allow users to reset their password if they forgot it
- **Variables:** `{{ .ConfirmationURL }}`
- **Flow:** Password recovery

### 6. **reauthentication.html**

- **Purpose:** Ask users to re-authenticate before performing a sensitive action
- **Variables:** `{{ .Token }}`
- **Flow:** Security/sensitive operations

## Colors & Design

- **Accent (Primary):** `#efd957` (Postino Yellow)
- **Text (Dark):** `#171717`
- **Muted Text:** `#6b7280` (Gray)
- **Background (Card):** `#ffffff` (White)
- **Background (Page):** `#f8f9fa` (Light Gray)

## How to Use

1. Copy the entire HTML content from each template file
2. Paste the HTML into the corresponding Supabase email template body
3. Replace template variables as needed (they follow Supabase's syntax: `{{ .VariableName }}`)
4. Test the email in Supabase console before deploying

## Notes

- All templates use Supabase template syntax: `{{ .VariableName }}`
- No external CSS or resources—everything is inline
- Responsive design works on all modern email clients
- Consistent branding across all authentication flows
