# Looker MCP Tool Call Examples (Power Automate / JSON-RPC 2.0)

When calling the `/mcp` (`ExecuteUserMcp`) action in Power Automate, pass one of the following JSON-RPC requests into the action's **Raw Body** parameter.

## List Available Tools (`tools/list`)

### Request Payload
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/list",
  "params": {}
}
```

### Sample Response
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "tools": [
      {
        "name": "run_look",
        "description": "Executes a saved Look by ID and returns tabular data"
      },
      {
        "name": "run_inline_query",
        "description": "Executes an ad-hoc query against a model and explore"
      },
      {
        "name": "get_lookml_model_explore",
        "description": "Returns fields and metadata for an explore"
      }
    ]
  }
}
```

## Execute `run_look` (`look_id=25`)

### Request Payload
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "tools/call",
  "params": {
    "name": "run_look",
    "arguments": {
      "look_id": "25"
    }
  }
}
```

### Sample Response
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[\n  {\"orders.created_date\": \"2026-07-24\", \"orders.count\": 142, \"order_items.total_revenue\": 18450.50},\n  {\"orders.created_date\": \"2026-07-23\", \"orders.count\": 198, \"order_items.total_revenue\": 24110.25}\n]"
      }
    ]
  }
}
```

## Execute `run_look` with Optional Parameters (`result_format`, `limit`)

### Request Payload
```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "tools/call",
  "params": {
    "name": "run_look",
    "arguments": {
      "look_id": "25",
      "result_format": "json",
      "limit": "500"
    }
  }
}
```
