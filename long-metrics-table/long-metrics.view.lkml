
view: base_fields {
  extension: required
  dimension: value { type: number }
  dimension: row_count { type: number }
  dimension: product_id { type: number }
  dimension: department { type: string }
  dimension: dt { type: string }
  dimension: month { type: string }
  dimension: quarter { type: string }
  dimension: year { type: string }
  measure: sum_value { type: sum sql: ${TABLE}.value ;; }
  measure: sum_row_count { type: sum sql: ${TABLE}.row_count ;; }
  measure: count { type: count }
}

view: day_agg_fields {
  extension: required
  dimension: r7d { type: number }
  dimension: r28d { type: number }
  dimension: r90d { type: number }
  dimension: mtd { type: number }
  dimension: mtd_row_count { type: number }
  dimension: ytd { type: number }
  dimension: ytd_row_count { type: number }
  dimension: rest_of_year { type: number }
  dimension: rest_of_year_row_count { type: number }
}

view: month_agg_fields {
  extension: required
  dimension: value { type: number }
  dimension: product_id { type: number }
  dimension: department { type: string }
  dimension: month { type: string }
  dimension: quarter { type: string }
  dimension: year { type: string }
  dimension: r3m { type: number }
  dimension: r6m { type: number }
  dimension: r12m { type: number }
  dimension: month_row_count { type: number }
  dimension: yoy { type: number }
  dimension: yoy_change { type: number }
}

view: quarter_agg_fields {
  extension: required
  dimension: value { type: number }
  dimension: product_id { type: number }
  dimension: department { type: string }
  dimension: quarter { type: string }
  dimension: year { type: string }
}


view: booleans {
  extension: required
  dimension: current_date { type: date sql: CURRENT_TIMESTAMP() ;; }
  # dimension: current_year { type: number sql: ${current_date::date_year} ;; }
  dimension_group: year_diff { type: duration sql_start: ${dt} ;; sql_end: ${current_date} ;; intervals: [year] }
  # dimension: is_this_year { type: yesno sql: ${year} = ${current_year} ;; }
  # dimension: is_last_year { type: yesno sql: ${year} = ( ${current_year} - 1 ) ;; }
}

view: metric_total_sale_price {
  extends: [base_fields, day_agg_fields, booleans]
  derived_table: {
    explore_source: order_items {
      column: value { field: order_items.total_sale_price}
      column: row_count { field: order_items.count }
      column: product_id { field: products.id }
      column: department { field: products.department }
      column: dt { field: order_items.created_date }
      column: month { field: order_items.created_month }
      column: quarter { field: order_items.created_quarter }
      column: year { field: order_items.created_year }
      derived_column: r7d { sql:
        SUM(value) OVER (
          PARTITION BY product_id ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: r28d { sql:
        SUM(value) OVER (
          PARTITION BY product_id ORDER BY dt ROWS BETWEEN 27 PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: r90d { sql:
        SUM(value) OVER (
          PARTITION BY product_id ORDER BY dt ROWS BETWEEN 89 PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: mtd { sql:
        SUM(value) OVER (
          PARTITION BY product_id, month, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: mtd_row_count { sql:
        COUNT(1) OVER (
          PARTITION BY product_id, month, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: ytd { sql:
        SUM(value) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: ytd_row_count { sql:
        COUNT(1) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: rest_of_year { sql:
        SUM(value) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
        ) ;;
      }
      derived_column: rest_of_year_row_count { sql:
        COUNT(1) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
        ) ;;
      }
      derived_column: source {sql: "Daily Actual" ;;}
    }
  }
}

explore: metric_total_sale_price { hidden: yes }
view: metric_total_sale_price_month_aggregated {
  extends: [month_agg_fields]
  derived_table: {
    explore_source: metric_total_sale_price {
      column: value { field: metric_total_sale_price.sum_value }
      column: row_count { field: metric_total_sale_price.sum_row_count }
      column: product_id { field: metric_total_sale_price.product_id }
      column: department { field: metric_total_sale_price.department }
      column: month { field: metric_total_sale_price.month  }
      column: quarter { field: metric_total_sale_price.quarter }
      column: year { field: metric_total_sale_price.year }
      derived_column: dt { sql: CAST(NULL AS TIMESTAMP) ;; }
      derived_column: r3m { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r6m { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY month ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r12m { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY month ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) ;; }
      derived_column: yoy { sql: value - LAG(value, 12) OVER (PARTITION BY product_id ORDER BY month) ;; }
      derived_column: yoy_change { sql: ( value / NULLIF(LAG(value, 12) OVER (PARTITION BY product_id ORDER BY month), 0) ) - 1  ;; }
      derived_column: source {sql: "Monthly Actual" ;;}
    }
  }
}

view: metric_total_sale_price_quarter_aggregated {
  extends: [quarter_agg_fields]
  derived_table: {
    explore_source: metric_total_sale_price {
      column: value { field: metric_total_sale_price.sum_value }
      column: row_count { field: metric_total_sale_price.sum_row_count }
      column: product_id { field: metric_total_sale_price.product_id }
      column: department { field: metric_total_sale_price.department }
      column: quarter { field: metric_total_sale_price.quarter }
      column: year { field: metric_total_sale_price.year }
      derived_column: dt { sql: CAST(NULL AS TIMESTAMP) ;; }
      derived_column: month { sql: CAST(NULL AS TIMESTAMP) ;; }
      derived_column: r3q { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY quarter ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r6q { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY quarter ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r12q { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY quarter ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) ;; }
      derived_column: yoy { sql: value - LAG(value, 4) OVER (PARTITION BY product_id ORDER BY quarter) ;; }
      derived_column: yoy_change { sql: ( value / NULLIF(LAG(value, 4) OVER (PARTITION BY product_id ORDER BY quarter), 0) ) - 1  ;; }
      derived_column: source {sql: "Quarterly Actual" ;;}
    }
  }
}


view: metric_total_gross_margin {
  extends: [base_fields, day_agg_fields, booleans]
  derived_table: {
    explore_source: order_items {
      column: value { field: order_items.total_gross_margin }
      column: row_count { field: order_items.count }
      column: product_id { field: products.id }
      column: department { field: products.department }
      column: dt { field: order_items.created_date }
      column: month { field: order_items.created_month }
      column: quarter { field: order_items.created_quarter }
      column: year { field: order_items.created_year }
      derived_column: r7d { sql:
        SUM(value) OVER (
          PARTITION BY product_id ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: r28d { sql:
        SUM(value) OVER (
          PARTITION BY product_id ORDER BY dt ROWS BETWEEN 27 PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: r90d { sql:
        SUM(value) OVER (
          PARTITION BY product_id ORDER BY dt ROWS BETWEEN 89 PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: mtd { sql:
        SUM(value) OVER (
          PARTITION BY product_id, month, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: mtd_row_count { sql:
        COUNT(1) OVER (
          PARTITION BY product_id, month, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: ytd { sql:
        SUM(value) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: ytd_row_count { sql:
        COUNT(1) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) ;;
      }
      derived_column: rest_of_year { sql:
        SUM(value) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
        ) ;;
      }
      derived_column: rest_of_year_row_count { sql:
        COUNT(1) OVER (
          PARTITION BY product_id, year ORDER BY dt ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING
        ) ;;
      }
      derived_column: source {sql: "Daily Actual" ;;}
    }
  }
}

explore: metric_total_gross_margin { hidden: yes }

view: metric_total_gross_margin_month_aggregated {
  extends: [month_agg_fields]
  derived_table: {
    explore_source: metric_total_gross_margin {
      column: value { field: metric_total_gross_margin.sum_value }
      column: row_count { field: metric_total_gross_margin.sum_row_count }
      column: product_id { field: metric_total_gross_margin.product_id }
      column: department { field: metric_total_gross_margin.department }
      column: month { field: metric_total_gross_margin.month  }
      column: quarter { field: metric_total_gross_margin.quarter }
      column: year { field: metric_total_gross_margin.year }
      derived_column: dt { sql: CAST(NULL AS TIMESTAMP) ;; }
      derived_column: r3m { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r6m { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY month ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r12m { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY month ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) ;; }
      derived_column: yoy { sql: value - LAG(value, 12) OVER (PARTITION BY product_id ORDER BY month) ;; }
      derived_column: yoy_change { sql: ( value / NULLIF(LAG(value, 12) OVER (PARTITION BY product_id ORDER BY month), 0) ) - 1  ;; }
      derived_column: source {sql: "Monthly Actual" ;;}
    }
  }
}

view: metric_total_gross_margin_quarter_aggregated {
  extends: [quarter_agg_fields]
  derived_table: {
    explore_source: metric_total_gross_margin {
      column: value { field: metric_total_gross_margin.sum_value }
      column: row_count { field: metric_total_gross_margin.sum_row_count }
      column: product_id { field: metric_total_gross_margin.product_id }
      column: department { field: metric_total_gross_margin.department }
      column: quarter { field: metric_total_gross_margin.quarter }
      column: year { field: metric_total_gross_margin.year }
      derived_column: dt { sql: CAST(NULL AS TIMESTAMP) ;; }
      derived_column: month { sql: CAST(NULL AS TIMESTAMP) ;; }
      derived_column: r3q { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY quarter ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r6q { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY quarter ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) ;; }
      derived_column: r12q { sql: SUM(value) OVER (PARTITION BY product_id ORDER BY quarter ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) ;; }
      derived_column: yoy { sql: value - LAG(value, 4) OVER (PARTITION BY product_id ORDER BY quarter) ;; }
      derived_column: yoy_change { sql: ( value / NULLIF(LAG(value, 4) OVER (PARTITION BY product_id ORDER BY quarter), 0) ) - 1  ;; }
      derived_column: source {sql: "Quarterly Actual" ;;}
    }
  }
}

explore: combined_metrics_day {
  label: "Combined Metrics"
  join: dim_products { sql_on: ${dim_products.id} = ${combined_metrics_day.product_id} ;; }

  always_filter: { filters: [source_parameter: "Daily Actual", timeframe: "current_view"]}
  sql_always_where: 
    {% condition source_parameter %} ${source} {% endcondition %}
    AND
    {% if combined_metrics_day.current_period._is_filtered or combined_metrics_day.current_period._is_selected %}
      1=1
    {% else %}
      ${current_period} = 'Current'
    {% endif %}
    ;;

  query: sale_price_by_category_7d {
    label: "Total Sale Price by Category (7D)"
    description: "Returns the rolling 7-day total sale price by product category."
    dimensions: [dim_products.category]
    measures: [total_sale_price]
    filters: [
      combined_metrics_day.timeframe: "r7d",
      combined_metrics_day.source_parameter: "Daily Actual",
      combined_metrics_day.current_period: "Current"
    ]
  }

  query: monthly_ytd_metrics_comparison {
    label: "YTD Metrics Comparison (Current vs Last Year)"
    description: "Compares YTD Total Sale Price and Gross Margin between Current and Last Year."
    dimensions: [combined_metrics_day.month, combined_metrics_day.current_period]
    measures: [total_sale_price, total_gross_margin]
    filters: [
      combined_metrics_day.timeframe: "ytd",
      combined_metrics_day.source_parameter: "Daily Actual"
    ]
  }
}
view: combined_metrics_day {
  extends: [base_fields, booleans]
  derived_table: {
    persist_for: "24 hours"
    sql:
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r7d as value, 'r7d' as timeframe,                       'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r28d as value, 'r28d' as timeframe,                     'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r90d as value, 'r90d' as timeframe,                     'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, ytd as value, 'ytd' as timeframe,                       'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, ytd_row_count as value, 'ytd_row_count' as timeframe,   'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, rest_of_year as value, 'rest_of_year' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, `value` as value, 'current_view' as timeframe,                    'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, value as value, 'current_view' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r3m as value, 'r3m' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r6m as value, 'r6m' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r12m as value, 'r12m' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy as value, 'yoy' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy_change as value, 'yoy_change' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, value as value, 'current_view' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r3q as value, 'r3q' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r6q as value, 'r6q' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r12q as value, 'r12q' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy as value, 'yoy' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy_change as value, 'yoy_change' as timeframe, 'Total Sale Price' as metric, 'Current' as current_period FROM ${metric_total_sale_price_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r7d as value, 'r7d' as timeframe,                       'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r28d as value, 'r28d' as timeframe,                     'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r90d as value, 'r90d' as timeframe,                     'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, ytd as value, 'ytd' as timeframe,                       'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, ytd_row_count as value, 'ytd_row_count' as timeframe,   'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, rest_of_year as value, 'rest_of_year' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, `value` as value, 'current_view' as timeframe,                    'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, value as value, 'current_view' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r3m as value, 'r3m' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r6m as value, 'r6m' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r12m as value, 'r12m' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy as value, 'yoy' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy_change as value, 'yoy_change' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, value as value, 'current_view' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r3q as value, 'r3q' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r6q as value, 'r6q' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, r12q as value, 'r12q' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy as value, 'yoy' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, yoy_change as value, 'yoy_change' as timeframe, 'Total Gross Margin' as metric, 'Current' as current_period FROM ${metric_total_gross_margin_quarter_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r7d, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r7d' as timeframe, 'Total Sale Price' as metric, 'Yesterday' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r28d, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r28d' as timeframe, 'Total Sale Price' as metric, 'Yesterday' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r90d, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r90d' as timeframe, 'Total Sale Price' as metric, 'Yesterday' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd' as timeframe, 'Total Sale Price' as metric, 'Yesterday' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd_row_count, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd_row_count' as timeframe, 'Total Sale Price' as metric, 'Yesterday' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(rest_of_year, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'rest_of_year' as timeframe, 'Total Sale Price' as metric, 'Yesterday' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(`value`, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'current_view' as timeframe, 'Total Sale Price' as metric, 'Yesterday' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r7d, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r7d' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r28d, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r28d' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r90d, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r90d' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd_row_count, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd_row_count' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(rest_of_year, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'rest_of_year' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(`value`, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'current_view' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r7d, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r7d' as timeframe, 'Total Gross Margin' as metric, 'Yesterday' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r28d, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r28d' as timeframe, 'Total Gross Margin' as metric, 'Yesterday' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r90d, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r90d' as timeframe, 'Total Gross Margin' as metric, 'Yesterday' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd' as timeframe, 'Total Gross Margin' as metric, 'Yesterday' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd_row_count, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd_row_count' as timeframe, 'Total Gross Margin' as metric, 'Yesterday' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(rest_of_year, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'rest_of_year' as timeframe, 'Total Gross Margin' as metric, 'Yesterday' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(`value`, 1) OVER (PARTITION BY product_id ORDER BY dt) as value, 'current_view' as timeframe, 'Total Gross Margin' as metric, 'Yesterday' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r7d, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r7d' as timeframe, 'Total Gross Margin' as metric, 'Last Year' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r28d, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r28d' as timeframe, 'Total Gross Margin' as metric, 'Last Year' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r90d, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'r90d' as timeframe, 'Total Gross Margin' as metric, 'Last Year' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd' as timeframe, 'Total Gross Margin' as metric, 'Last Year' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(ytd_row_count, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'ytd_row_count' as timeframe, 'Total Gross Margin' as metric, 'Last Year' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(rest_of_year, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'rest_of_year' as timeframe, 'Total Gross Margin' as metric, 'Last Year' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(`value`, 365) OVER (PARTITION BY product_id ORDER BY dt) as value, 'current_view' as timeframe, 'Total Gross Margin' as metric, 'Last Year' as current_period FROM ${metric_total_gross_margin.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(value, 1) OVER (PARTITION BY product_id ORDER BY month) as value, 'current_view' as timeframe, 'Total Sale Price' as metric, 'Last Month' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r3m, 1) OVER (PARTITION BY product_id ORDER BY month) as value, 'r3m' as timeframe, 'Total Sale Price' as metric, 'Last Month' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r6m, 1) OVER (PARTITION BY product_id ORDER BY month) as value, 'r6m' as timeframe, 'Total Sale Price' as metric, 'Last Month' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r12m, 1) OVER (PARTITION BY product_id ORDER BY month) as value, 'r12m' as timeframe, 'Total Sale Price' as metric, 'Last Month' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(yoy, 1) OVER (PARTITION BY product_id ORDER BY month) as value, 'yoy' as timeframe, 'Total Sale Price' as metric, 'Last Month' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(yoy_change, 1) OVER (PARTITION BY product_id ORDER BY month) as value, 'yoy_change' as timeframe, 'Total Sale Price' as metric, 'Last Month' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(value, 12) OVER (PARTITION BY product_id ORDER BY month) as value, 'current_view' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r3m, 12) OVER (PARTITION BY product_id ORDER BY month) as value, 'r3m' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r6m, 12) OVER (PARTITION BY product_id ORDER BY month) as value, 'r6m' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(r12m, 12) OVER (PARTITION BY product_id ORDER BY month) as value, 'r12m' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(yoy, 12) OVER (PARTITION BY product_id ORDER BY month) as value, 'yoy' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
      UNION ALL
      SELECT source, product_id, department, row_count, dt, month, quarter, year, LAG(yoy_change, 12) OVER (PARTITION BY product_id ORDER BY month) as value, 'yoy_change' as timeframe, 'Total Sale Price' as metric, 'Last Year' as current_period FROM ${metric_total_sale_price_month_aggregated.SQL_TABLE_NAME}
    ;;
  }
  dimension: dt { type: date }
  dimension: month { type: date_month }
  dimension: month_name { type: date_month_name sql: ${TABLE}.month ;; }
  dimension: quarter { type: date_quarter }
  dimension: year { type: date_year }
  dimension: timeframe { label: "Current View"}
  dimension: current_period {
    type: string
    description: "Distinguishes between current data and historical data aligned to this date."
  }
  dimension: metric { hidden: yes }
  dimension: calculated_view {}
  dimension: source {}
  parameter: source_parameter {
    type: string
    allowed_value: {
      label: "Daily Actual"
      value: "Daily Actual"
    }
    allowed_value: {
      label: "Monthly Actual"
      value: "Monthly Actual"
    }
    allowed_value: {
      label: "Quarterly Actual"
      value: "Quarterly Actual"
    }
  }
  measure: sum_value { hidden: yes }
  measure: sum_row_count { hidden: yes }
  measure: total_sale_price { type: sum sql: ${TABLE}.value ;; filters: [metric: "Total Sale Price" ]}
  measure: total_gross_margin { type: sum sql: ${TABLE}.value ;; filters: [metric: "Total Gross Margin" ]}
  measure: gross_margin_percentage {
    type: number
    sql: ${total_gross_margin} / NULLIF(${total_sale_price}, 0) ;;
    value_format_name: percent_2
    view_label: "Combined Metrics Day"
  }
}

view: dim_products {
  sql_table_name: `looker-private-demo.thelook_ecommerce.products` ;;
  dimension: id {primary_key: yes type: number }
  dimension: department { sql: TRIM(${TABLE}.department) ;; }
  dimension: category { sql: TRIM(${TABLE}.category) ;; }
  dimension: brand { sql: TRIM(${TABLE}.brand) ;; }
}
