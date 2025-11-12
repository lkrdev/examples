# Hierarchical Combo Filter with Search Example

This is an example of embedding Looker and creating a custom hierarchical filter component that interacts with the Looker iframe. The example showcases how to pull data from the Looker API using the Node SDK, modifying the API request to provide advanced searching functionalty and applying a custom component to the embedded Looker dashboard.

![Hierarchical Combo Filter with Search Example](/assets/hierarchical-combo-filter-with-search.png)

## Demo

-   Open the example at [https://lkr.dev/examples/hierarchical-combo-filter-with-search](https://lkr.dev/examples/hierarchical-combo-filter-with-search).
-   Click on the "Apply Hierarchical Filters" button to open the filter popover.
-   Search for a brand, category, or item to filter the dashboard. For example, search for Calvin Klein or Jeans.
-   Click on a brand, category, or item to select it.
-   The dashboard will be updated to show the filtered data.
-   The filter popover will be closed and the selected filters will be applied to the dashboard.

## LookML examples

-   Comprehensive field searching `case_sensitive: no` [docs](https://docs.cloud.google.com/looker/docs/reference/param-field-case-sensitive)

## Embed SDK

**Updating Iframe with Javascript events**
This example uses Looker's [Javascript Events](https://docs.cloud.google.com/looker/docs/embedded-javascript-events) in order to facilitate an external filter

### Mapping the hierarchy selection to proper dashboard filters

## Looker API SDK (Node)

### Custom Filters

-   createFilterExpression and `matches_filter()`

### Mapping the results to a hierarchy data type

## Performance

### Aggregate Tables
