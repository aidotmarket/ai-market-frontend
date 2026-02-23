# Security Notes

## CSRF Protection
Bearer tokens are used for API authentication. Since tokens are sent via Authorization header (not cookies), requests are inherently protected against CSRF attacks. Tokens are stored in-memory via Zustand and never persisted to localStorage or cookies.
