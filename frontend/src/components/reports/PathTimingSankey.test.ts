import { mount } from "@vue/test-utils";
import PathTimingSankey from "./PathTimingSankey.vue";

vi.mock("vue-echarts", () => ({ default: { name: "VChart", props: ["option"], template: "<div class='chart' />" } }));

describe("PathTimingSankey", () => {
  const sankey = { granularity: "WEEK" as const, nodes: [{ id: "bucket:2026-07-01:path:walk", label: "Jul 1–7 · Walking", bucketLabel: "Jul 1–7", pathLabel: "Walking", color: "#123456", depth: 0, value: 600 }, { id: "bucket:2026-07-08:path:walk", label: "Jul 8–14 · Walking", bucketLabel: "Jul 8–14", pathLabel: "Walking", color: "#123456", depth: 1, value: 500 }], links: [{ source: "bucket:2026-07-01:path:walk", target: "bucket:2026-07-08:path:walk", sourceLabel: "Jul 1–7 · Walking", targetLabel: "Jul 8–14 · Walking", value: 500 }] };

  it("renders the server-supplied nodes and links without aggregating values", () => {
    const wrapper = mount(PathTimingSankey, { props: { sankey } });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as { tooltip: { formatter: (params: unknown) => string }; series: Array<{ type: string; data: Array<{ name: string; pathLabel: string; depth: number; value: number }>; links: typeof sankey.links }> };

    expect(option.series[0]).toMatchObject({ type: "sankey", links: sankey.links });
    expect(option.series[0].data[1]).toMatchObject({ name: sankey.nodes[1].id, pathLabel: "Walking", depth: 1, value: 500 });
    expect(wrapper.get('[role="img"]').attributes("aria-label")).toContain("Jul 1–7 · Walking to Jul 8–14 · Walking, 00:08:20");
    expect(option.tooltip.formatter({ dataType: "node", data: sankey.nodes[0] })).toContain("Jul 1–7");
    expect(option.tooltip.formatter({ dataType: "node", data: sankey.nodes[0] })).toContain("10m");
    expect(option.tooltip.formatter({ dataType: "node", data: sankey.nodes[0] })).not.toContain(":00");
    expect(wrapper.findAll(".sankey-aggregate-total").map((total) => total.text())).toEqual(["10m", "8m"]);
    expect(wrapper.find(".sankey-aggregate-total").attributes("aria-label")).toBe("Jul 1–7: 10m");
  });

  it("explains an empty flow", () => {
    const wrapper = mount(PathTimingSankey, { props: { sankey: { ...sankey, nodes: [], links: [] } } });
    expect(wrapper.text()).toContain("No tracked time to show in this flow.");
  });
});
