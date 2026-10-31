import { getObjectsApi } from "@/api/web-sdk-client";
import { readExternalFaceAttributes } from "@/app/_services/external-face.client";

jest.mock("@/api/web-sdk-client", () => ({
  getObjectsApi: jest.fn(),
  normalizeApiError: jest.fn(async (error: unknown) => ({
    message: error instanceof Error ? error.message : "Request failed",
    status: 400,
  })),
}));

const mockedApi = jest.mocked(getObjectsApi);

function attribute(id: string, key: string) {
  return {
    id,
    objectId: "object-1",
    key,
    value: key,
    category: "service",
    contentType: "text",
    _public: true,
    actionId: "action-1",
    objectNonce: 2,
    whenCreated: new Date("2026-02-01T00:00:00.000Z"),
    whenModified: new Date("2026-02-12T12:30:00.000Z"),
  };
}

describe("readExternalFaceAttributes", () => {
  it("reads every page of attributes", async () => {
    const listObjectAttributes = jest
      .fn()
      .mockResolvedValueOnce({
        attributes: [attribute("attribute-1", "b")],
        next: "page-2",
      })
      .mockResolvedValueOnce({
        attributes: [attribute("attribute-2", "a")],
        next: "",
      });
    mockedApi.mockReturnValue({
      listObjectAttributes,
    } as unknown as ReturnType<typeof getObjectsApi>);

    const result = await readExternalFaceAttributes("object-1");

    expect(listObjectAttributes).toHaveBeenNthCalledWith(1, {
      objectId: "object-1",
      next: undefined,
    });
    expect(listObjectAttributes).toHaveBeenNthCalledWith(2, {
      objectId: "object-1",
      next: "page-2",
    });
    expect(result.attributes).toEqual([
      {
        id: "attribute-1",
        key: "b",
        value: "b",
        category: "service",
        content_type: "text",
        public: true,
        object_nonce: 2,
        when_created: "2026-02-01T00:00:00.000Z",
        when_modified: "2026-02-12T12:30:00.000Z",
      },
      expect.objectContaining({ id: "attribute-2", key: "a" }),
    ]);
  });
});
