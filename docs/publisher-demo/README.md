# Publisher object-view demo

This folder records the production demo created for the Viewer object-view flow. It contains only public resource identifiers and token-free API payloads. It must never contain access tokens, refresh tokens, passwords, signatures, or session cookies.

## Result

The `Digital Vouchers` organization (`000000000000000000000001`) owns three new faces and templates. One object was minted from each template and transferred to:

`0xd1AEb264fd240879da9e0c344c0b0DF5BF3AbbF5`

| Demo             | Face                       | Template                   | Object                     | Public Viewer                                                                          |
| ---------------- | -------------------------- | -------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| Product passport | `6a7b2300a7cd3da77bd5dc43` | `6a7b2355a7cd3da77bd5dc46` | `6a7b237fa7cd3da77bd5dc49` | [Aurelia S7 Chronograph](https://wallet.dual.network/objects/6a7b237fa7cd3da77bd5dc49) |
| Battery passport | `6a7b2300a7cd3da77bd5dc44` | `6a7b2355a7cd3da77bd5dc47` | `6a7b23a8a7cd3da77bd5dc4e` | [NovaCell B24](https://wallet.dual.network/objects/6a7b23a8a7cd3da77bd5dc4e)           |
| Collectible card | `6a7b2300a7cd3da77bd5dc45` | `6a7b2356a7cd3da77bd5dc48` | `6a7b23a8a7cd3da77bd5dc53` | [Aetherwing Sentinel](https://wallet.dual.network/objects/6a7b23a8a7cd3da77bd5dc53)    |

The complete identifiers, mint actions, transfer actions, canonical links, and short links are in [`manifest.json`](./manifest.json).

## What the demo exercises

- The inventory and public list endpoints return the new `items[]` object-view shape.
- `items[].object` supplies metadata, allowlisted custom data, ownership, hashes, and state.
- `items[].display` supplies the resolved face descriptor without exposing face source.
- The card front requests `include=display&display_variant=card`.
- The Apple Wallet-style pass opens on the face only. Its three-dot menu contains Share and opens details where `metadata`, `custom`, `system`, and object hashes are distinct sections.
- Owned inventory passes show a separate lower-corner action button when the inventory projection returns template actions; anonymous public passes do not expose action controls.
- Each face also has independently renderable `detail` and `share` variants.
- Each template enables `mint`, `transfer`, and `update`. `mint` is private to the publisher; owner mutations are public actions subject to object ownership.
- `set_attributes` is intentionally not part of this demo.

## Custom-data update and face rerender

The product-passport template is the update demonstration. Its assigned face reads `custom.manufacturer`, `custom.model`, `custom.serial_number`, `custom.origin`, `custom.warranty_until`, and `custom.status` directly in the SVG template. The template exposes the owner-authorized `update` action and allowlists those custom fields for the public object projection.

Open the Aurelia object from the recipient wallet, select **Update**, and enter an object patch in **Data (JSON)**. For example:

```json
{
  "custom": {
    "status": "SERVICED",
    "warranty_until": "2032-06-18"
  }
}
```

After the signed action completes, Viewer invalidates the inventory, object-detail, and activity queries. The returned `content_hash` is included in the local display URL as a cache revision, so the assigned face is fetched and rendered again even when the face definition itself has not changed. Refreshing the public link also renders the latest public custom values.

The update action merges supplied custom keys into the existing custom object. Do not send metadata fields under `custom`: metadata and custom data are separate object fields and appear as separate sections in pass details.

## Payloads

The files under [`payloads/`](./payloads/) are the exact token-free face and template authoring payloads:

- `face-product-passport.json`
- `face-battery-passport.json`
- `face-magic-card.json`
- `template-product-passport.json`
- `template-battery-passport.json`
- `template-magic-card.json`

The template payloads contain the face IDs from this organization. Recreating them in another organization requires replacing `face_id` with the IDs returned by that organization's face creation calls. Names are unique per organization, so these create calls are not idempotent.

## Reproduction sequence

Use a short-lived publisher access token and keep it only in process memory:

```sh
export DUAL_API='https://api.dual.network'
export DUAL_ACCESS_TOKEN='<publisher access token>'
export DUAL_ORG_ID='000000000000000000000001'
```

Switch into the publisher organization and use the returned organization-scoped access token for every subsequent request:

```sh
export DUAL_ORG_ACCESS_TOKEN="$(
  curl --fail --silent --show-error \
    --request POST "$DUAL_API/organizations/switch" \
    --header "Authorization: Bearer $DUAL_ACCESS_TOKEN" \
    --header 'Content-Type: application/json' \
    --data "{\"id\":\"$DUAL_ORG_ID\"}" |
    jq --raw-output '.access_token'
)"
```

Create each face, record the returned ID, place it in the corresponding template payload, and create the template:

```sh
curl --fail --silent --show-error \
  --request POST "$DUAL_API/faces" \
  --header "Authorization: Bearer $DUAL_ORG_ACCESS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data-binary @payloads/face-product-passport.json

curl --fail --silent --show-error \
  --request POST "$DUAL_API/templates" \
  --header "Authorization: Bearer $DUAL_ORG_ACCESS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data-binary @payloads/template-product-passport.json
```

Mint one object with the server-managed publisher account. `nonce: 0` is replaced by the backend only for this standard authenticated publisher path; passkey and EOA callers must prepare and sign the action instead.

```sh
export DUAL_TEMPLATE_ID='<template id>'

jq --null-input --arg template_id "$DUAL_TEMPLATE_ID" \
  '{action:{mint:{template_id:$template_id,num:1}},nonce:0}' |
  curl --fail --silent --show-error \
    --request POST "$DUAL_API/ebus/execute" \
    --header "Authorization: Bearer $DUAL_ORG_ACCESS_TOKEN" \
    --header 'Content-Type: application/json' \
    --data-binary @-
```

Transfer the returned object to the Viewer account:

```sh
export DUAL_OBJECT_ID='<object id>'
export DUAL_VIEWER_ADDRESS='0xd1AEb264fd240879da9e0c344c0b0DF5BF3AbbF5'

jq --null-input --arg id "$DUAL_OBJECT_ID" --arg to "$DUAL_VIEWER_ADDRESS" \
  '{action:{transfer:{id:$id,to:$to}},nonce:0}' |
  curl --fail --silent --show-error \
    --request POST "$DUAL_API/ebus/execute" \
    --header "Authorization: Bearer $DUAL_ORG_ACCESS_TOKEN" \
    --header 'Content-Type: application/json' \
    --data-binary @-
```

## Verification

Verify the target inventory shape, card descriptor, and action projection:

```sh
curl --fail --silent --show-error \
  "$DUAL_API/objects?owner=$DUAL_VIEWER_ADDRESS&limit=25&include=display&display_variant=card&actions=true" \
  --header "Authorization: Bearer $DUAL_ORG_ACCESS_TOKEN" |
  jq '{items,actions}'
```

Verify anonymous public data and each renderer variant:

```sh
curl --fail --silent --show-error \
  "$DUAL_API/public/objects?id=$DUAL_OBJECT_ID&limit=1&include=display&display_variant=card"

curl --fail --silent --show-error \
  "$DUAL_API/public/objects/$DUAL_OBJECT_ID/display/card"
curl --fail --silent --show-error \
  "$DUAL_API/public/objects/$DUAL_OBJECT_ID/display/detail"
curl --fail --silent --show-error \
  "$DUAL_API/public/objects/$DUAL_OBJECT_ID/display/share"
```

The legacy `/public/objects/{objectId}/render` route should resolve to the detail variant during the v1 migration. New consumers should use `/display/{variant}`.

## Credential hygiene

Unset shell credentials after the run and rotate any token that was pasted into a chat, terminal history, or issue:

```sh
unset DUAL_ACCESS_TOKEN DUAL_ORG_ACCESS_TOKEN
```
