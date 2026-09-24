# Marsh Supply Portal

Standalone Production Command module for Marsh Supply inventory and ShipStation fulfillment visibility.

## Environment

- `SHIPSTATION_API_KEY`: server-only ShipStation API v2 key.
- `SHIPSTATION_API_SECRET`: optional, required with legacy ShipStation API credentials.
- `TRACK17_API_KEY`: server-only 17TRACK API token. Shipped orders with tracking numbers from the last 30 days are registered for tracking; subsequent syncs use 17TRACK's delivered status to update the order pipeline. Registration uses the account's tracking quota. Add this secret to the hosting environment; never use a `NEXT_PUBLIC_` prefix.
- Supabase values are reserved for persistent inventory and role-based access when attached to the Production Command database.

The portal falls back to representative orders when ShipStation is not configured so the interface can be reviewed safely.
