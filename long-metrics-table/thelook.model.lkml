connection: "looker-private-demo"

include: "*.view.lkml"

explore: order_items {
  hidden: yes
  join: products {
    type: left_outer
    sql_on: ${order_items.product_id} = ${products.id} ;;
    relationship: many_to_one
  }
}
