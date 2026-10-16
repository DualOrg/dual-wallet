# Wallet documentation

- [Architecture](./architecture.md)
- Development guidelines:
  - [the wallet product guidelines](./development/wallet-product-guidelines.md)
  - [UI and accessibility guidelines](./development/ui-accessibility-guidelines.md)
  - [Architecture and logic guidelines](./development/architecture-logic-guidelines.md)
  - [React and state guidelines](./development/react-state-guidelines.md)
- [External-face integration and change guide](./external-face-integration.md),
  including the product application host (`dual-product-face-v1`, shared
  contract in [`contracts/dual-product-face-v1.json`](../contracts/dual-product-face-v1.json))
- [Dedicated applications, authentication, and shared packages](./dedicated-applications.md)
- [Branded wallet hosts](./branded-wallet-hosts.md): one engine, a separate
  branded deployment per brand configured only by environment
  (`dual-wallet-host-configuration-v1`), journey enforcement, entrance
  isolation, fail-closed mode and readback
- Specs:
  - [Wallet branding contract](./specs/2026-08-20-wallet-branding-design.md)
- Proposals (not deployed):
  - [Runtime write outcome read, r20](./proposals/runtime-write-status-r20.md):
    the Studio runtime contract the wallet needs to free a journal slot from a
    verified Warranty & Service or transfer offer outcome
