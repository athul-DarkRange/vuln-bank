# ISB (InSecure Bank): intentional vulnerabilities

Instructor reference. Do not share with students before the exercise. This file is excluded from the Docker image.

## Authentication and sessions
- SQL injection in login
- Weak JWT implementation and weak signing secret
- Token stored in `localStorage` (`jwt_token`)
- No server-side token invalidation, no session expiration
- Token exposure in URLs
- Cookie set without the `Secure` flag
- Username enumeration through differing login and reset responses
- Weak password reset: 3-digit PIN, no rate limiting on attempts, timing differences in PIN checks
- Plaintext password storage
- No password complexity requirements
- No rate limiting anywhere (login, register, reset, transfers)

## Authorization and access control
- Broken object level authorization (BOLA / IDOR) on accounts, balances, transactions, user details, cards and bill payments
- Broken object property level authorization (BOPLA)
- Mass assignment on registration, profile updates and card limit updates
- Unauthenticated access to account and transaction lookups
- Client-side-only admin checks
- Admin panel at a guessable hidden path (`/sup3r_s3cr3t_admin`)
- Admin actions (approve loan, delete account, suspend, create admin) with weak server-side authorization and no confirmation or audit logging
- Excessive data exposure in API responses

## Injection
- SQL injection in login, balance and transaction lookups, biller queries, bill payment history, card transaction history, merchant and card lookups
- SQL injection in the GraphQL resolver query construction
- Prompt injection against the AI support agent

## Cross-site scripting and client-side issues
- Stored XSS in the user bio (rendered unescaped on the dashboard)
- Reflected XSS in the search boxes on the blog, careers and admin pages
- Unescaped username rendered in the dashboard greeting and admin views
- XSS through `innerHTML` use for server messages (login, register and other forms)
- No CSRF protection on any state-changing request
- No Content Security Policy

## Information disclosure
- Debug information in login, register and error responses
- Detailed error messages and raw SQL queries exposed
- Server time and internal details in responses
- Public `/debug/users` endpoint
- Exposed environment files (`/.env`, `/.env.bak`) with credentials
- Flask debug mode enabled
- Interactive API documentation publicly accessible (`/api/docs/`)
- Transaction history information disclosure

## File handling
- Unrestricted file upload (no type, size or content validation)
- User-controlled filenames and path traversal
- Server path disclosure in upload responses
- SSRF through profile picture import by URL
- Mock cloud metadata service reachable through the SSRF (`/latest/meta-data/...`, including IAM role credentials)

## Transactions and business logic
- No amount validation; negative transfers allowed
- No transaction limits
- No validation of recipient accounts
- Race conditions in transfers and balance updates
- No transaction atomicity
- Race condition and repeat approval in loan approval
- Loan request and approval amount handling

## Virtual cards
- Predictable card number and CVV generation
- Plaintext storage of card details
- No validation on card limits
- BOLA in card operations (view, freeze, fund, update limit, transaction history)
- Mass assignment in card limit updates and funding exchange-rate handling
- Client-controlled currency conversion during card funding
- Race conditions in card balance updates
- No transaction verification and no card activity monitoring

## Bill payments
- No validation on payment amounts, missing payment limits
- No validation on biller accounts
- Predictable reference numbers
- BOLA and information disclosure in payment history
- Race conditions in payment processing

## Merchant payment API
- Plaintext merchant passwords and API keys
- API keys returned in registration and login responses
- Raw card number and CVV accepted by the payment API
- Missing idempotency, replay protection, payment limits and rate limiting
- Object-level authorization gaps in payment lookup
- Detailed payment decline reasons and debug data exposure
- Predictable authorization code generation

## GraphQL
- Schema introspection enabled
- Weak JWT authentication inherited from the REST API
- No query depth or complexity limits
- Raw GraphQL error disclosure
- Transaction analytics exposed through admin-scoped queries

## AI customer support agent
- Prompt injection and role override
- Context injection
- Information disclosure through the AI (other users' data)
- Broken authorization in the AI context (anonymous mode)
- Direct database access through AI manipulation
- Exposed system prompt and configuration
- Insufficient validation of prompts

## Default credentials
- Admin: `admin` / `admin123`
- Merchants: `bookstore@isb.org` / `bookstore123`, `pwnshop@isb.org` / `pwnshop123`
- Default database credentials `postgres` / `postgres`
