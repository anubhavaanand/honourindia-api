# Security Policy

## Supported versions

| Version        | Supported |
| -------------- | --------- |
| `main`         | ✅        |
| Latest release | ✅        |
| Older tags     | ❌        |

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Use GitHub's private vulnerability reporting:

<https://github.com/anubhavaanand/honourindia-api/security/advisories/new>

Include as much of the following as you can:

- affected endpoint, file, or deployment;
- impact and a description of the vulnerability;
- steps to reproduce;
- a proof of concept or sample request;
- any suggested mitigation.

If private reporting is unavailable, contact a maintainer through GitHub and ask
for a private channel. Do not include exploit details in a public issue.

## Response expectations

- We aim to acknowledge a report within **7 days**.
- We aim to provide an initial assessment within **14 days**.
- We will agree on a fix and disclosure timeline with the reporter.
- We will credit the reporter in release notes unless they prefer anonymity.

## Scope

**In scope:**

- the API and server (`apps/server`);
- the embeddable widget (`packages/embed`);
- API key issuance, storage, and authentication;
- catalogue and image data integrity;
- deployment configuration and security headers.

**Out of scope:**

- vulnerabilities in third-party services or dependencies, unless they affect
  this project's configuration;
- social engineering or physical attacks;
- denial-of-service through the public rate limits;
- missing security headers on unrelated third-party sites.

## Safe harbour

We consider good-faith security research that follows this policy to be
authorized. We will not pursue or support legal action against researchers who
make a good-faith effort to follow this policy, avoid privacy violations, and
do not degrade service for others.
