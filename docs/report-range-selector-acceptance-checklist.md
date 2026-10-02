# Report range selector acceptance checklist

The draggable range selector below the Reports bar chart (shown when a range has more than 31 buckets).

- [ ] RS-01: By default the selector covers the whole date range chosen in the date picker (start 0%, end 100%), for both the slider and the inside (wheel/drag) zoom. Test: `SummaryBarChart.test.ts` "selects the whole date range in the range selector by default".
- [ ] RS-02: The selector is twice as tall as before (36px instead of 18px), and the chart grid leaves room for it so it does not overlap the axis labels. Test: `SummaryBarChart.test.ts` "draws a double-height range selector below the axis labels".
- [ ] RS-03: Ranges of 31 buckets or fewer still have no selector. Test: `SummaryBarChart.test.ts` "keeps short ranges without a range selector".
