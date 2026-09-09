import { mount } from "@vue/test-utils";
import PathTimingSankey from "./PathTimingSankey.vue";

vi.mock("vue-echarts", () => ({ default: { name: "VChart", props: ["option"], template: "<div class='chart' />" } }));

describe("PathTimingSankey", () => {
  const sankey = { granularity: "WEEK" as const, nodes: [{ id: "bucket:2026-07-01", label: "Jul 1–7" }, { id: "path:walk", label: "Walking", color: "#123456" }], links: [{ source: "bucket:2026-07-01", target: "path:walk", sourceLabel: "Jul 1–7", targetLabel: "Walking", value: 600 }] };

  it("renders the server-supplied nodes and links without aggregating values", () => {
    const wrapper = mount(PathTimingSankey, { props: { sankey } });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as { series: Array<{ type: string; data: Array<{ id: string; name: string }>; links: typeof sankey.links }> };

    expect(option.series[0]).toMatchObject({ type: "sankey", links: sankey.links });
    expect(option.series[0].data).toEqual(expect.arrayContaining([{ id: "bucket:2026-07-01", name: "Jul 1–7" }]));
    expect(wrapper.get('[role="img"]').attributes("aria-label")).toContain("Jul 1–7 to Walking, 00:10:00");
  });

  it("explains an empty flow", () => {
    const wrapper = mount(PathTimingSankey, { props: { sankey: { ...sankey, links: [] } } });
    expect(wrapper.text()).toContain("No tracked time to show in this flow.");
  });
});
