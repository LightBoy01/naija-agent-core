# Deprecation Notice (March 11, 2026)

This module contains the Legacy SMS Bridge logic (Python Script + Android Native App Blueprint).

## Status: DEPRECATED
The project has pivoted to a **Vision-First** verification model (Phase 7) where merchants upload receipts directly to the AI, and the AI verifies them visually or via Payment Provider API.

## Why?
1.  **Complexity:** Maintaining a physical Android device for every merchant is not scalable.
2.  **Reliability:** The Python script relied on Termux, which is prone to being killed by Android OS.
3.  **Security:** The original implementation lacked HMAC signatures (though patched in the API).

## Future Use
This code is preserved for reference in case a "High-Value" merchant specifically requests a private SMS relay server.

**Do not deploy this in production unless explicitly required.**
