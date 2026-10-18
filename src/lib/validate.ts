// Shared form validation utils for WEN platform

export type FieldError = Record<string, string>

// Nigerian phone: 080XXXXXXXX, 070XXXXXXXX, +2348XXXXXXXXX etc.
// Network code digit is 7/8/9, followed by 0/1 — matches every real NG
// mobile prefix (080,081,070,071,090,091, etc); anything else is typoed.
const NG_PHONE_RE = /^(?:\+?234|0)[789][01]\d{8}$/

export function validatePhone(value: string): string | null {
  const cleaned = value.replace(/[\s\-()]/g, '')
  if (!cleaned) return 'Phone number is required.'
  if (!NG_PHONE_RE.test(cleaned)) return 'Enter a valid Nigerian phone number (e.g. 08012345678).'
  return null
}

export function validateName(value: string): string | null {
  if (!value.trim()) return 'Name is required.'
  if (value.trim().length < 2) return 'Name must be at least 2 characters.'
  if (/\d/.test(value)) return 'Name should not contain numbers.'
  if (/[^a-zA-Z\s'\-.]/.test(value)) return 'Name contains invalid characters.'
  return null
}

export function validateLocation(value: string): string | null {
  if (!value.trim()) return 'Location is required.'
  if (value.trim().length < 3) return 'Please enter a more specific location.'
  return null
}

export function validateEmail(value: string): string | null {
  if (!value.trim()) return null // email is optional on most forms
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.'
  return null
}

export function validateMessage(value: string): string | null {
  if (!value.trim()) return 'Message is required.'
  if (value.trim().length < 10) return 'Message is too short — please give us more detail.'
  return null
}

export function validateText(value: string, label: string, min = 2): string | null {
  if (!value.trim()) return `${label} is required.`
  if (value.trim().length < min) return `${label} must be at least ${min} characters.`
  return null
}
