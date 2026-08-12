import {
  externalFaceCapabilities,
  externalFaceBridgeApplication,
  externalFaceApplicationMatches,
  externalFaceBridgeOrigin,
  resolveExternalFaceBridgeRequest,
  startAuthenticatedExternalFaceBridge,
  toAuthenticatedExternalFaceContext,
} from "@/app/_lib/external-face-bridge";
import type { ObjectDetail } from "@/app/_domain/inventory";

const item: ObjectDetail = {
  id: "object-1",
  name: "Passport",
  description: "A product passport",
  category: "dpp",
  imageUrl: "https://assets.example/passport.png",
  owner: "0x1234",
  templateId: "template-1",
  version: 2,
  stateHash: "state-hash",
  contentHash: "content-hash",
  createdAt: new Date("2026-08-12T00:00:00Z"),
  modifiedAt: new Date("2026-08-12T01:00:00Z"),
  custom: { serial_number: "SERIAL-1" },
  system: { private_source: "must-not-cross" },
};

describe("authenticated external face bridge", () => {
  it("composes only implemented and injected capability modules", () => {
    const baseline = externalFaceCapabilities({}).map(
      ({ operation }) => operation,
    );
    expect(baseline).toEqual([
      "bridge.ping",
      "object.current.read",
      "object.changes.subscribe",
      "object.changes.unsubscribe",
    ]);
    expect(
      externalFaceCapabilities({
        readAttributes: jest.fn(),
        requestAction: jest.fn(),
        openDetails: jest.fn(),
      }).map(({ operation }) => operation),
    ).toEqual([
      ...baseline,
      "object.attributes.read",
      "object.action.request",
      "viewer.details.open",
    ]);
    expect(baseline.some((value) => value.startsWith("service_book."))).toBe(
      false,
    );
  });

  it("builds the bridge object without system data or credentials", () => {
    const context = toAuthenticatedExternalFaceContext(item, ["update"]);
    expect(context.object).toMatchObject({
      id: "object-1",
      template_id: "template-1",
      metadata: { name: "Passport" },
      custom: { serial_number: "SERIAL-1" },
    });
    expect(context.object).not.toHaveProperty("system");
    expect(JSON.stringify(context)).not.toMatch(/token|cookie|private_source/i);
  });

  it("uses only the selected public face-view config", () => {
    const context = toAuthenticatedExternalFaceContext({
      ...item,
      display: {
        kind: "external-document",
        url: "https://faces.dual.network/dpp/v1/",
        mediaType: "text/html",
        interactive: true,
        revision: "face-view-1",
        config: { metadata: { name: "dpp" }, settings: { screen: "home" } },
      },
    });

    expect(context.config).toEqual({
      metadata: { name: "dpp" },
      settings: { screen: "home" },
    });
    expect(context).not.toHaveProperty("renderer_config");
  });

  it("allows only explicitly configured production origins", () => {
    const original = process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS;
    const originalApplications =
      process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS;
    process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS =
      "https://dpp.faces.dual.network";
    process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS =
      "dual.dpp@1=https://dpp.faces.dual.network/v1/";
    expect(
      externalFaceBridgeOrigin(
        "https://dpp.faces.dual.network/v1/embed?object_id=object-1",
      ),
    ).toBe("https://dpp.faces.dual.network");
    expect(
      externalFaceBridgeApplication(
        "https://dpp.faces.dual.network/v1/embed?object_id=object-1",
      ),
    ).toMatchObject({ id: "dual.dpp", majorVersion: 1 });
    expect(
      externalFaceBridgeOrigin("https://publisher.example/embed"),
    ).toBeUndefined();
    expect(
      externalFaceBridgeApplication(
        "https://dpp.faces.dual.network/another-app/",
      ),
    ).toBeUndefined();
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS;
    } else {
      process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS = original;
    }
    if (originalApplications === undefined) {
      delete process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS;
    } else {
      process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS =
        originalApplications;
    }
  });

  it("binds initialization to the registered application ID and major version", () => {
    const descriptor = {
      id: "dual.dpp",
      majorVersion: 1,
      baseUrl: "https://faces.dual.network/dpp/v1/",
      origin: "https://faces.dual.network",
    };
    expect(
      externalFaceApplicationMatches(descriptor, {
        id: "dual.dpp",
        version: "1.4.2",
      }),
    ).toBe(true);
    expect(
      externalFaceApplicationMatches(descriptor, {
        id: "dual.trading",
        version: "1.4.2",
      }),
    ).toBe(false);
    expect(
      externalFaceApplicationMatches(descriptor, {
        id: "dual.dpp",
        version: "2.0.0",
      }),
    ).toBe(false);
    expect(
      externalFaceApplicationMatches(descriptor, {
        id: "dual.dpp",
        version: "1.0.0 malformed",
      }),
    ).toBe(false);
  });

  it("returns only the bound current object", async () => {
    const context = toAuthenticatedExternalFaceContext(item);
    await expect(
      resolveExternalFaceBridgeRequest(
        {
          type: "dual.face.request",
          protocol: "dual.face.bridge",
          version: 1,
          request_id: "request-1",
          operation: "object.current.read",
          payload: {},
        },
        context,
        {},
      ),
    ).resolves.toEqual(context.object);
  });

  it("does not expose an action execution operation", async () => {
    await expect(
      resolveExternalFaceBridgeRequest(
        {
          type: "dual.face.request",
          protocol: "dual.face.bridge",
          version: 1,
          request_id: "request-2",
          operation: "execute_action",
          payload: {},
        },
        toAuthenticatedExternalFaceContext(item),
        {},
      ),
    ).rejects.toThrow("capability_denied");
  });

  it("reads the authenticated attribute projection through a bound handler", async () => {
    const readAttributes = jest.fn().mockResolvedValue({
      attributes: [
        {
          id: "attribute-1",
          key: "profile.name",
          value: "DUAL",
          public: true,
          object_nonce: 3,
          when_created: "2026-08-12T00:00:00.000Z",
          when_modified: "2026-08-12T01:00:00.000Z",
        },
      ],
    });
    await expect(
      resolveExternalFaceBridgeRequest(
        {
          type: "dual.face.request",
          protocol: "dual.face.bridge",
          version: 1,
          request_id: "request-attributes",
          operation: "object.attributes.read",
          payload: {},
        },
        toAuthenticatedExternalFaceContext(item),
        { readAttributes },
      ),
    ).resolves.toMatchObject({
      attributes: [{ key: "profile.name", value: "DUAL" }],
    });
    expect(readAttributes).toHaveBeenCalledTimes(1);
  });

  it("turns an available action into untrusted Viewer form defaults", async () => {
    const requestAction = jest.fn().mockResolvedValue({
      status: "completed",
      action_id: "action-1",
    });
    await expect(
      resolveExternalFaceBridgeRequest(
        {
          type: "dual.face.request",
          protocol: "dual.face.bridge",
          version: 1,
          request_id: "request-action",
          operation: "object.action.request",
          payload: {
            name: "update",
            input: { custom: { service_status: "complete" } },
          },
        },
        toAuthenticatedExternalFaceContext(item, ["update"]),
        { requestAction },
      ),
    ).resolves.toEqual({ status: "completed", action_id: "action-1" });
    expect(requestAction).toHaveBeenCalledWith({
      name: "update",
      input: { custom: JSON.stringify({ service_status: "complete" }) },
    });
  });

  it("rejects unavailable actions and child-supplied object identifiers", async () => {
    const context = toAuthenticatedExternalFaceContext(item, ["update"]);
    const request = {
      type: "dual.face.request" as const,
      protocol: "dual.face.bridge" as const,
      version: 1 as const,
      request_id: "request-action-invalid",
      operation: "object.action.request",
    };
    await expect(
      resolveExternalFaceBridgeRequest(
        {
          ...request,
          payload: { name: "transfer", input: { to: "0x1234" } },
        },
        context,
        { requestAction: jest.fn() },
      ),
    ).rejects.toThrow("action_unavailable");
    await expect(
      resolveExternalFaceBridgeRequest(
        {
          ...request,
          payload: {
            name: "update",
            input: { id: "another-object", custom: {} },
          },
        },
        context,
        { requestAction: jest.fn() },
      ),
    ).rejects.toThrow("invalid_request");
  });

  it("connects an allowlisted child over a transferred message port", async () => {
    class FakePort {
      peer!: FakePort;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

      postMessage(data: unknown) {
        queueMicrotask(() =>
          this.peer.onmessage?.({ data } as MessageEvent<unknown>),
        );
      }

      start() {}
      close() {}
    }

    class FakeMessageChannel {
      port1: MessagePort;
      port2: MessagePort;

      constructor() {
        const one = new FakePort();
        const two = new FakePort();
        one.peer = two;
        two.peer = one;
        this.port1 = one as unknown as MessagePort;
        this.port2 = two as unknown as MessagePort;
      }
    }

    const originalChannel = global.MessageChannel;
    const originalEncoder = global.TextEncoder;
    const originalOrigins =
      process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS;
    const originalApplications =
      process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS;
    global.MessageChannel =
      FakeMessageChannel as unknown as typeof MessageChannel;
    global.TextEncoder = class {
      encode(value: string) {
        return new Uint8Array(value.length);
      }
    } as typeof TextEncoder;
    process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS =
      "https://dpp.faces.dual.network";
    process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS =
      "dual.dpp@1=https://dpp.faces.dual.network/v1/";

    try {
      const postMessage = jest.fn();
      const frame = {
        contentWindow: { postMessage },
      } as unknown as HTMLIFrameElement;
      const context = toAuthenticatedExternalFaceContext(item);
      const host = startAuthenticatedExternalFaceBridge({
        frame,
        displayUrl: "https://dpp.faces.dual.network/v1/embed",
        context,
        handlers: {
          readAttributes: jest.fn().mockResolvedValue({
            attributes: [
              {
                id: "attribute-large",
                key: "large",
                value: "x".repeat(600 * 1024),
                public: false,
                object_nonce: 1,
                when_created: "2026-08-12T00:00:00.000Z",
                when_modified: "2026-08-12T00:00:00.000Z",
              },
            ],
          }),
        },
      });
      expect(host).toBeDefined();
      expect(postMessage).toHaveBeenCalledTimes(1);

      const [bootstrap, targetOrigin, transferred] = postMessage.mock
        .calls[0] as [{ channel_id: string }, string, MessagePort[]];
      expect(targetOrigin).toBe("https://dpp.faces.dual.network");
      const childPort = transferred[0];
      expect(childPort).toBeInstanceOf(FakePort);
      const received: unknown[] = [];
      childPort.onmessage = (event) => received.push(event.data);
      childPort.start();
      childPort.postMessage({
        type: "dual.face.ready",
        protocol: "dual.face.bridge",
        version: 1,
        channel_id: bootstrap.channel_id,
        application: { id: "dual.dpp", version: "1.0.0" },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(received[0]).toMatchObject({
        type: "dual.face.initialize",
        context: {
          object_id: "object-1",
          public: false,
          object: { id: "object-1" },
        },
      });

      childPort.postMessage({
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: "request-current",
        operation: "object.current.read",
        payload: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(received[1]).toMatchObject({
        type: "dual.face.response",
        request_id: "request-current",
        ok: true,
        result: { id: "object-1" },
      });

      childPort.postMessage({
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: "request-current",
        operation: "object.current.read",
        payload: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(received.at(-1)).toMatchObject({
        ok: false,
        error: { code: "invalid_request" },
      });

      childPort.postMessage({
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: "request-malformed",
        operation: "bridge.ping",
        payload: {},
        token: "must-not-be-accepted",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(received.at(-1)).toMatchObject({
        ok: false,
        error: { code: "invalid_request" },
      });

      childPort.postMessage({
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: "request-large-response",
        operation: "object.attributes.read",
        payload: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(received.at(-1)).toMatchObject({
        ok: false,
        error: { code: "response_too_large" },
      });

      for (let index = 0; index < 28; index += 1) {
        childPort.postMessage({
          type: "dual.face.request",
          protocol: "dual.face.bridge",
          version: 1,
          request_id: `request-ping-${index}`,
          operation: "bridge.ping",
          payload: {},
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      childPort.postMessage({
        type: "dual.face.request",
        protocol: "dual.face.bridge",
        version: 1,
        request_id: "request-rate-limited",
        operation: "bridge.ping",
        payload: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(received.at(-1)).toMatchObject({
        ok: false,
        error: { code: "rate_limited", retryable: true },
      });
      host?.close();
    } finally {
      global.MessageChannel = originalChannel;
      global.TextEncoder = originalEncoder;
      if (originalOrigins === undefined) {
        delete process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS;
      } else {
        process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS = originalOrigins;
      }
      if (originalApplications === undefined) {
        delete process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS;
      } else {
        process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS =
          originalApplications;
      }
    }
  });
});
