view: products {
  sql_table_name: `looker-private-demo.thelook_ecommerce.products` ;;

  dimension: id {
    primary_key: yes
    type: number
    sql: ${TABLE}.id ;;
  }

  dimension: department {
    type: string
    sql: ${TABLE}.department ;;
  }

  dimension: category {
    type: string
    sql: ${TABLE}.category ;;
  }

  dimension: brand {
    type: string
    sql: ${TABLE}.brand ;;
  }
}
