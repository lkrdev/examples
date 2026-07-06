view: order_items {
  sql_table_name: `looker-private-demo.thelook_ecommerce.order_items` ;;

  dimension: id {
    primary_key: yes
    type: number
    sql: ${TABLE}.id ;;
  }

  dimension: product_id {
    type: number
    sql: ${TABLE}.product_id ;;
  }

  dimension_group: created {
    type: time
    timeframes: [
      raw,
      date,
      week,
      month,
      quarter,
      year
    ]
    sql: ${TABLE}.created_at ;;
  }

  measure: count {
    type: count
  }

  measure: total_sale_price {
    type: sum
    sql: ${TABLE}.sale_price ;;
  }

  measure: total_gross_margin {
    type: sum
    sql: ${TABLE}.sale_price * 0.4 ;;
  }
}
