# Peyflex API Documentation

**Base URL:** `https://client.peyflex.com.ng`

## Authentication
All sensitive endpoints require a valid API token in the `Authorization` header.
- **Header:** `Authorization: Token YOUR_API_TOKEN`
- **Content-Type:** `application/json`

---

## 1. Electricity Recharge API

### Verify Electricity Meter Number
Validates a customer's meter number with the provider. No authentication required.

- **Method:** `GET`
- **URL:** `/api/electricity/verify/?identifier=electricity&meter={meter}&plan={plan}&type={type}`
- **Parameters:**
  - `identifier`: `electricity`
  - `meter`: e.g. `45145984782`
  - `plan`: e.g. `kaduna-electric`
  - `type`: e.g. `prepaid` or `postpaid`

**Response Example:**
```json
{
  "status": "SUCCESS",
  "customer_name": "MRS ROSE HARUNA 2",
  "message": "Meter verification successful"
}
```

---

## 2. Betting API

### Get Active Betting Companies
Returns a list of currently active betting companies supported by the system.

- **Method:** `GET`
- **URL:** `/api/v1/bet/companies/`
- **Authentication:** None

**Response Example:**
```json
{
  "success": true,
  "companies": [
    { "label": "1xBet", "code": "1xbet" },
    { "label": "Bet9ja", "code": "bet9ja" },
    { "label": "SportyBet", "code": "sportybet" }
  ]
}
```

### Verify Bet Account
Verifies a customer’s ID on a selected betting platform.

- **Method:** `POST`
- **URL:** `/api/v1/bet/verify/`
- **Authentication:** Required (`Token YOUR_API_TOKEN`)
- **Payload:**
```json
{
  "betting_company": "SportyBet",
  "customer_id": "08105867169"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Customer verified.",
  "data": {
    "code": 101,
    "name": "08105867169",
    "username": null,
    "reference": null,
    "type": "SportyBet",
    "accountNumber": "08105867169",
    "customerId": "08105867169"
  }
}
```

---

## 3. Recharge Card (E-Pins) API

### Purchase Recharge Card
- **Method:** `POST`
- **URL:** `/api/rc/purchase/`
- **Authentication:** Required (`Token YOUR_API_TOKEN`)
- **Payload:**
```json
{
  "network": "MTN",
  "amount": 100,
  "quantity": 1,
  "pin": "1234",
  "brand_name": "MyShop"
}
```

**Response Example:**
```json
{
  "success": true,
  "order": {
    "id": "4608fdc3-c994-4cfc-8079-f762313d1856",
    "reference": "RC-A992A9FB37DD4422",
    "status": "SUCCESS",
    "network": "MTN",
    "amount": 100,
    "quantity_ordered": 1,
    "quantity_delivered": 1,
    "price_per_card": 100,
    "total_charged": 100,
    "brand_name": "MyShop",
    "created_at": "2026-06-28T00:06:35.003404"
  },
  "cards": [
    {
      "pin": "06217873367724658",
      "serial": "83506315518374668"
    }
  ]
}
```

### Recharge Card History
- **Method:** `GET`
- **URL:** `/api/rc/orders/`
- **Authentication:** Required (`Token YOUR_API_TOKEN`)
- **Query Params (Optional):** `network`, `status`, `page`, `per_page`

### Card History by Batch
- **Method:** `GET`
- **URL:** `/api/rc/orders/{order_id}/`
- **Authentication:** Required (`Token YOUR_API_TOKEN`)
