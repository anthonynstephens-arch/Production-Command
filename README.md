# Marsh Supply Portal

Standalone Production Command module for Marsh Supply inventory and ShipStation fulfillment visibility.

## Environment

- `SHIPSTATION_API_KEY`: server-only ShipStation API v2 key.
- Supabase values are reserved for persistent inventory and role-based access when attached to the Production Command database.

The portal falls back to representative orders when ShipStation is not configured so the interface can be reviewed safely.
