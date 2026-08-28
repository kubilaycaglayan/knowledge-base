import { flushPromises, mount } from "@vue/test-utils";
import ItemsView from "./ItemsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

describe("ItemsView", () => {
  it("shows archived memberships while offering only active paths for new items", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items")
        return [
          {
            id: "item-1",
            title: "Existing item",
            source: "https://example.com/book",
            type: "BOOK",
            status: "PLANNED",
            progress: 0,
            pathIds: ["archived"],
            tags: [],
          },
        ];
      if (path === "/paths")
        return [
          { id: "active", name: "Current path", status: "ACTIVE" },
          { id: "archived", name: "Finished path", status: "ARCHIVED" },
        ];
      if (path === "/notes") return [];
      return undefined;
    });
    const wrapper = mount(ItemsView);
    await flushPromises();

    expect(wrapper.text()).toContain("Finished path");
    expect(wrapper.text()).toContain("https://example.com/book");
    expect(wrapper.find("fieldset legend").text()).toBe("Active paths");
    expect(wrapper.findAll("fieldset input")).toHaveLength(1);
    expect(wrapper.find("fieldset input").attributes("value")).toBe("active");
  });

  it("offers the supported item types when adding a resource", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items") return [];
      if (path === "/paths") return [];
      if (path === "/notes") return [];
      return undefined;
    });
    const wrapper = mount(ItemsView);
    await flushPromises();
    const type = wrapper.get('select[aria-label="Item type"]');
    expect(type.findAll("option").map((option) => option.text())).toContain(
      "MOVIE",
    );
    expect(type.findAll("option").map((option) => option.text())).toContain(
      "PAPER",
    );
    await type.setValue("MOVIE");
    await wrapper
      .get('input[aria-label="Item title"]')
      .setValue("A film to revisit");
    await wrapper
      .get('input[aria-label="Item source"]')
      .setValue("Criterion Collection");
    await wrapper.get("form").trigger("submit");
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"MOVIE"'),
      }),
    );
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"source":"Criterion Collection"'),
      }),
    );
  });

  it("opens one dialog with all item properties and saves them together", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/items")
        return [
          {
            id: "item-1",
            title: "Existing item",
            description: "Old description",
            source: "Old source",
            type: "BOOK",
            status: "PLANNED",
            progress: 20,
            pathIds: ["path-1"],
            tags: ["old"],
          },
        ];
      if (path === "/paths")
        return [{ id: "path-1", name: "Learning", status: "ACTIVE" }];
      if (path === "/notes") return [];
      return undefined;
    });
    const wrapper = mount(ItemsView);
    await flushPromises();

    await wrapper.get("button.text-button").trigger("click");
    expect(wrapper.find(".edit-dialog").exists()).toBe(true);
    expect(wrapper.findAll(".edit-dialog")).toHaveLength(1);
    expect(
      (wrapper.get('input[aria-label="Edit item title"]').element as HTMLInputElement)
        .value,
    ).toBe("Existing item");
    expect(
      (wrapper.get('textarea[aria-label="Edit item description"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("Old description");

    await wrapper
      .get('input[aria-label="Edit item title"]')
      .setValue("Updated item");
    await wrapper.get('select[aria-label="Edit item type"]').setValue("MOVIE");
    await wrapper
      .get('select[aria-label="Edit item status"]')
      .setValue("ACTIVE");
    await wrapper
      .get('input[aria-label="Edit item tags"]')
      .setValue("film, revisit");
    await wrapper.get(".edit-dialog button.primary").trigger("submit");

    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/items/item-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"title":"Updated item"'),
      }),
    );
    const update = vi
      .mocked(api)
      .mock.calls.find(([path, options]) => path === "/items/item-1" && options);
    expect(update?.[1]?.body).toContain('"type":"MOVIE"');
    expect(update?.[1]?.body).toContain('"status":"ACTIVE"');
    expect(update?.[1]?.body).toContain('"tags":["film","revisit"]');
  });
});
