import { mount } from "@vue/test-utils";
import PathTimingSankey from "./PathTimingSankey.vue";

vi.mock("vue-echarts", () => ({
  default: {
    name: "VChart",
    props: ["option"],
    template: "<div class='chart' />",
  },
}));

describe("PathTimingSankey", () => {
  const sankey = {
    granularity: "WEEK" as const,
    nodes: [
      {
        id: "bucket:2026-07-01:path:walk",
        label: "Jul 1–7 · Walking",
        bucketLabel: "Jul 1–7",
        pathLabel: "Walking",
        color: "#123456",
        depth: 0,
        value: 600,
      },
      {
        id: "bucket:2026-07-08:path:walk",
        label: "Jul 8–14 · Walking",
        bucketLabel: "Jul 8–14",
        pathLabel: "Walking",
        color: "#123456",
        depth: 1,
        value: 500,
      },
    ],
    links: [
      {
        source: "bucket:2026-07-01:path:walk",
        target: "bucket:2026-07-08:path:walk",
        sourceLabel: "Jul 1–7 · Walking",
        targetLabel: "Jul 8–14 · Walking",
        value: 500,
      },
    ],
  };

  it("renders the server-supplied nodes and links without aggregating values", () => {
    const wrapper = mount(PathTimingSankey, { props: { sankey } });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as {
      tooltip: { formatter: (params: unknown) => string };
      series: Array<{
        type: string;
        data: Array<{
          name: string;
          pathLabel: string;
          depth: number;
          value: number;
        }>;
        links: typeof sankey.links;
      }>;
    };

    expect(option.series[0]).toMatchObject({
      type: "sankey",
      links: sankey.links,
    });
    expect(option.series[0].data[1]).toMatchObject({
      name: sankey.nodes[1].id,
      pathLabel: "Walking",
      depth: 1,
      value: 500,
    });
    expect(wrapper.get('[role="img"]').attributes("aria-label")).toContain(
      "Jul 1–7 · Walking to Jul 8–14 · Walking, 00:08:20",
    );
    expect(
      option.tooltip.formatter({ dataType: "node", data: sankey.nodes[0] }),
    ).toContain("Jul 1–7");
    expect(
      option.tooltip.formatter({ dataType: "node", data: sankey.nodes[0] }),
    ).toContain("10m");
    expect(
      option.tooltip.formatter({ dataType: "node", data: sankey.nodes[0] }),
    ).not.toContain(":00");
    expect(
      wrapper.findAll(".sankey-aggregate-total").map((total) => total.text()),
    ).toEqual(["10m", "8m"]);
    expect(
      wrapper.find(".sankey-aggregate-total").attributes("aria-label"),
    ).toBe("Jul 1–7: 10m");
  });

  it("explains an empty flow", () => {
    const wrapper = mount(PathTimingSankey, {
      props: { sankey: { ...sankey, nodes: [], links: [] } },
    });
    expect(wrapper.text()).toContain("No tracked time to show in this flow.");
  });

  it("shows isolated bucket data without stretching a linkless Sankey", () => {
    const longPath = "A complete path label with enough words to wrap over lines";
    const wrapper = mount(PathTimingSankey, {
      props: {
        sankey: {
          ...sankey,
          nodes: [
            {
              ...sankey.nodes[0],
              pathLabel: longPath,
              bucketLabel: "May 2026",
            },
          ],
          links: [],
        },
        bucketCount: 3,
      },
    });

    expect(wrapper.findComponent({ name: "VChart" }).exists()).toBe(false);
    expect(wrapper.get(".sankey-isolated-bucket").text()).toContain(longPath);
    expect(wrapper.get('[role="img"]').attributes("aria-label")).toContain(
      `May 2026, ${longPath}, 00:10:00`,
    );
  });

  it("groups multiple isolated paths into one month bucket", () => {
    const wrapper = mount(PathTimingSankey, {
      props: {
        sankey: {
          ...sankey,
          nodes: sankey.nodes.map((node) => ({
            ...node,
            depth: 0,
            bucketLabel: "Oct 2026",
          })),
          links: [],
        },
        bucketCount: 3,
      },
    });

    expect(wrapper.findAll(".sankey-isolated-bucket")).toHaveLength(1);
    expect(wrapper.findAll(".sankey-isolated-paths li")).toHaveLength(2);
  });

  it("reserves empty bucket positions and label gutters at both flow endpoints", () => {
    const wrapper = mount(PathTimingSankey, {
      props: { sankey, bucketCount: 4 },
    });
    const series = (wrapper.getComponent({ name: "VChart" }).props("option") as {
      series: Array<{
        left: number;
        right: number;
        nodeAlign: string;
        data: Array<{
          name: string;
          depth: number;
          label?: { show: boolean; position?: string; align?: string };
        }>;
        label: { overflow: string; width: number; lineHeight: number };
      }>;
    }).series[0];

    expect(series).toMatchObject({ left: 150, right: 150, nodeAlign: "left" });
    expect(series.label).toMatchObject({
      overflow: "break",
      width: 140,
      lineHeight: 16,
    });
    expect(series.data.map((node) => node.depth)).toEqual([0, 1, 2, 3]);
    expect(series.data.slice(2).map((node) => node.name)).toEqual([
      "empty-bucket:2",
      "empty-bucket:3",
    ]);
    expect(series.data[0].label).toMatchObject({
      show: true,
      position: "left",
      align: "right",
    });
    expect(series.data[1].label).toMatchObject({
      show: true,
      position: "right",
      align: "left",
    });
    expect(series.data[2].label).toEqual({ show: false });
  });

  it("hides repeated intermediate labels while preserving full tooltip labels", () => {
    const nodes = Array.from({ length: 4 }, (_value, depth) => ({
      ...sankey.nodes[0],
      id: `bucket:${depth}:path:walk`,
      depth,
      bucketLabel: `Bucket ${depth}`,
    }));
    const links = Array.from({ length: 3 }, (_value, depth) => ({
      source: nodes[depth].id,
      target: nodes[depth + 1].id,
      sourceLabel: nodes[depth].label,
      targetLabel: nodes[depth + 1].label,
      value: 500,
    }));
    const wrapper = mount(PathTimingSankey, {
      props: { sankey: { ...sankey, nodes, links }, bucketCount: 4 },
    });
    const option = wrapper.getComponent({ name: "VChart" }).props("option") as {
      series: Array<{
        data: Array<{ label?: { show: boolean } }>;
      }>;
      tooltip: { formatter: (params: unknown) => string };
    };

    expect(option.series[0].data.map((node) => node.label?.show)).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(
      option.tooltip.formatter({
        dataType: "edge",
        data: { ...links[1], sourceLabel: "Full source label", targetLabel: "Full target label" },
      }),
    ).toContain("Full target label");
  });

  it("removes trailing buckets when the right edge of the range moves left", () => {
    const nodes = Array.from({ length: 4 }, (_value, depth) => ({
      ...sankey.nodes[0],
      id: `bucket:${depth}:path:walk`,
      depth,
      bucketLabel: `Bucket ${depth}`,
    }));
    const links = Array.from({ length: 3 }, (_value, depth) => ({
      source: nodes[depth].id,
      target: nodes[depth + 1].id,
      sourceLabel: nodes[depth].label,
      targetLabel: nodes[depth + 1].label,
      value: 500,
    }));
    const wrapper = mount(PathTimingSankey, {
      props: {
        sankey: { ...sankey, nodes, links },
        bucketCount: 4,
        rangeWindow: { start: 0, end: 60 },
      },
    });
    const series = (wrapper.getComponent({ name: "VChart" }).props("option") as {
      series: Array<{ data: Array<{ depth: number }>; links: typeof links }>;
    }).series[0];

    expect(series.data.map((node) => node.depth)).toEqual([0, 1, 2]);
    expect(series.links).toHaveLength(2);
  });
});
