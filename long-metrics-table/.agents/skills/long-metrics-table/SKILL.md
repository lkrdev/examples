---
name: long-metrics-table
description: Guide and patterns for creating, managing, and consuming long metrics (narrow format) tables in LookML.
---

# Skill: Managing Metrics and Dimensions in `long-metrics.view.lkml`

This document describes the pattern used in `long-metrics.view.lkml` for defining and aggregating metrics, and provides instructions on how to add new dimensions and measures.

## Overview of the Pattern

The file `long-metrics.view.lkml` implements a long-table format (narrow format) for metrics to allow for flexible reporting. It uses derived tables and UNIONs to stack data for different metrics and timeframes.

- **Base Fields & Aggregation Views**: Views with `extension: required` (like `base_fields`, `day_agg_fields`) are used to share common fields across different aggregation levels.
- **Metric Specific Views**: Views like `metric_total_sale_price` compute window functions (running totals, rolling averages) over an explore source (`order_items`).
- **Combined View**: `combined_metrics_day` uses a derived table with a series of `UNION ALL` queries to stack data for different metrics and timeframes into a single table. This view handles measures by filtering on a `metric` dimension.

---

## How-To Guides

### Adding a New Dimension from Products or Other Joined Views

If you want to add a new dimension (e.g., `category` from the `products` view, which is joined in the `order_items` explore):

1. **Update the Source Metric View** (`metric_total_sale_price`):
   - In the `explore_source` block, add the new dimension as a column.
     ```lookml
     column: category { field: products.category }
     ```
   - **Note on Data Consistency**: If the dimension is a string, it is often best to wrap it in `TRIM()` in the metric view or ensure it is trimmed in the destination view to avoid join failures due to trailing spaces.
2. **Update the View Definition**:
   - Define the dimension in the corresponding view (e.g., if it needs to be in `base_fields` or directly in `metric_total_sale_price`).
     ```lookml
     dimension: category { type: string }
     ```
3. **Update the Combined View** (`combined_metrics_day`):
   - In the `derived_table` block, update **all** the `SELECT` statements in the `UNION ALL` query to include the new column. Ensure you maintain column order across all branches of the UNION.
     ```sql
     SELECT source, product_id, category, row_count, dt, month, quarter, year, r7d as value, ...
     ```
   - Add the dimension definition in the `combined_metrics_day` view.
     ```lookml
     dimension: category {}
     ```

### Adding a New Measure (e.g., `total_gross_margin`)

To add a new measure that follows this pattern (e.g., `total_gross_margin`):

1. **Create a New Metric View**:
   - Create a new view similar to `metric_total_sale_price` (e.g., `metric_total_gross_margin`).
   - In the `explore_source`, change the source field for `value` to map to the measure or field representing gross margin. You may need to search for this field in all the files in the workspace.
     ```lookml
     column: value { field: order_items.total_gross_margin }
     ```
2. **Update the Combined View** (`combined_metrics_day`):
   - In the `derived_table` block, add a new set of `UNION ALL` branches that select from the new metric view.
   - Hardcode the metric name as `'Total Gross Margin'` in the SELECT list.
     ```sql
     UNION ALL
     SELECT source, product_id, row_count, dt, month, quarter, year, r7d as value, 'r7d' as timeframe, 'Total Gross Margin' as metric, 'calculated' as calculated_view FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
     ```
3. **Define the Measure in `combined_metrics_day`**:
   - Add a new measure that sums the `value` column and applies a filter for this specific metric.
     ```lookml
     measure: total_gross_margin {
       type: sum
       sql: ${TABLE}.value ;;
       filters: [metric: "Total Gross Margin"]
     }
     ```

### Post-Aggregation Calculations

For non-additive calculations that cannot be pre-aggregated (e.g., percentages or ratios like `gross_margin_percentage`), you should add them as new measures in the combined view (`combined_metrics_day`) using a measure of `type: number`.

### How to Add a Post-Aggregation Measure

1. **Ensure Component Measures Exist**: Make sure the component metrics are already defined as filtered sum measures in the `combined_metrics_day` view. For example:
   ```lookml
   measure: total_sale_price {
     type: sum
     sql: ${TABLE}.value ;;
     filters: [metric: "Total Sale Price"]
   }
   measure: total_gross_margin {
     type: sum
     sql: ${TABLE}.value ;;
     filters: [metric: "Total Gross Margin"]
   }
   ```
2. **Add the Calculated Measure**: Define a new measure of `type: number` that references the component measures.
   ```lookml
   measure: gross_margin_percentage {
     type: number
     sql: ${total_gross_margin} / NULLIF(${total_sale_price}, 0) ;;
     value_format_name: percent_2
   }
   ```
   This ensures that the calculation is performed _after_ aggregation, regardless of the dimensions selected in the query.

### Period Alignment and Conditional Filtering

In the `combined_metrics_day` explore, we use specific Liquid logic to manage the Period alignment pattern.

#### Dynamic Source Filtering

```sql
{% condition source_parameter %} ${source} {% endcondition %}
```

This binds the `source_parameter` (a Looker parameter) to the `${source}` dimension. It allows the UI to drive the data source selection (e.g., Daily vs. Monthly) through a parameter, which is then injected into the SQL `WHERE` clause.

#### Default Period Filtering

```sql
{% if combined_metrics_day.current_period._is_filtered or combined_metrics_day.current_period._is_selected %}
  1=1
{% else %}
  ${current_period} = 'Current'
{% endif %}
```

This logic manages the visibility of historical "anchored" rows:

- **Why?**: The period alignment pattern works by unioning historical data (e.g., 'Last Year') and mapping it to the _current_ date. This allows for easy pivoting. However, it means there are multiple rows for the same date (one for 'Current', one for 'Last Year', etc.).
- **Behavior**:
  - If a user **selects** or **filters** on the `current_period` dimension, they are explicitly asking to see these period comparisons, so the logic does nothing (`1=1`).
  - If they **do not** interact with `current_period`, the explore defaults to `${current_period} = 'Current'`. This prevents "duplicate" data from appearing in standard reports where period comparison isn't requested.

### Adding Quick Start Queries to the Explore

To make it easy for users to consume these stacked metrics, define pre-configured `query` blocks (Quick Start queries) within the `explore: combined_metrics_day` definition. 

When you add a new metric, timeframe, or slice, consider adding or updating a corresponding Quick Start query in the explore:

1. **Syntax**:
   ```lookml
   explore: combined_metrics_day {
     # ...
     query: query_name {
       label: "User Friendly Label"
       description: "Detailed description of what this pre-configured query returns."
       dimensions: [dimension_1, dimension_2]
       measures: [measure_1, measure_2]
       filters: [
         combined_metrics_day.timeframe: "desired_timeframe",
         combined_metrics_day.source_parameter: "desired_source",
         combined_metrics_day.current_period: "Current"
       ]
     }
   }
   ```
2. **Filters**: Always ensure the correct `timeframe` (e.g. `r7d`, `mtd`, `ytd`) and `source_parameter` filters are applied. If the query does not use period alignment comparison, set `current_period: "Current"` to avoid duplicate values.

### Preventing Double-Counting (Enforcing Filters)

Because a long metrics table stacks multiple distinct timeframes (e.g., `r7d`, `r28d`, `ytd`) and comparison periods (e.g., `Current`, `Last Year`) as rows, queries that do not filter on these dimensions will trigger **double-counting errors** (summing different timeframes together).

To prevent this:

1. **Use `always_filter` in the Explore**:
   Ensure the explore definition requires default filters for the critical stacked dimensions:
   ```lookml
   explore: combined_metrics_day {
     always_filter: {
       filters: [
         source_parameter: "Daily Actual",
         timeframe: "current_view"
       ]
     }
   }
   ```
2. **Use `sql_always_where` with Liquid Logic**:
   For dimensions that control period alignment (like `current_period`), use conditional Liquid logic to default to the current period unless the user explicitly filters or selects the comparison period:
   ```lookml
   sql_always_where: 
     {% if combined_metrics_day.current_period._is_filtered or combined_metrics_day.current_period._is_selected %}
       1=1
     {% else %}
       ${current_period} = 'Current'
     {% endif %}
     ;;
   ```
