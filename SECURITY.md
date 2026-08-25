# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/DualOrg/dual-wallet/security/advisories/new).
Do not open a public issue for a security report.

Please include what you were able to do, the steps to reproduce it, and the
commit or deployed URL you tested. We aim to acknowledge a report within five
working days.

## Scope

This repository is the end-user wallet front end and its server-side session
and proxy boundary. The API, the chain, and the notification service live in
other repositories; a report about those is still welcome here and will be
routed on.

Findings that matter most here:

- anything that moves an API access or refresh token into browser-reachable
  code;
- anything that lets one organization's session read another organization's
  data;
- an external face escaping its iframe, reaching the session cookie, or getting
  an action executed without the wallet's own confirmation and signing step;
- a route that serves authenticated data without a valid session.

## Known weakness by configuration

`SESSION_SECRET` is optional. Left unset, the session cookie is sealed with a
key derived from a constant in this repository, which is public, so the cookie
carries no tamper-evidence. Any deployment that matters must set it. See the
deployment section of the [README](./README.md).
