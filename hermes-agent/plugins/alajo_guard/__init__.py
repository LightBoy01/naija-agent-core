"""
Alajo Financial Guard Plugin for Hermes Agent.
Ensures every autonomous action is backed by sufficient funds in the Aelixxr PostgreSQL Vault.
"""

import os
import json
import psycopg2
from typing import Any, Dict

def register(ctx):
    """Register the Alajo Financial Guard hooks."""
    ctx.register_hook("pre_tool_call", pre_tool_call_handler)
    ctx.register_hook("post_tool_call", post_tool_call_handler)

def get_db_connection():
    """Establishes a connection to the Sovereign PostgreSQL Ledger."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        return None
    return psycopg2.connect(db_url)

def pre_tool_call_handler(ctx: Any, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Checks the user's PostgreSQL balance before allowing Hermes to execute a tool.
    Returns an error response if balance is insufficient, which blocks the tool call.
    """
    user_phone = os.environ.get("AELIXXR_USER_PHONE")
    
    # If no phone is provided, we might be in a generic CLI mode. 
    # For institutional scale, we enforce phone identification.
    if not user_phone:
        return None # Proceed as normal for local dev

    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return {"error": "Sovereign Financial Ledger unavailable. Cannot authorize action."}
        
        with conn.cursor() as cur:
            # Atomic balance check
            cur.execute("SELECT energy_credits FROM users WHERE phone = %s", (user_phone,))
            result = cur.fetchone()
            
            if not result:
                return {"error": "User profile not found in Sovereign Ledger. Authorization failed."}
            
            energy = result[0]
            
            # Mandate: Autonomous actions cost 1 energy credit per tool iteration
            if energy <= 0:
                return {"error": f"Oga, your battery no reach (0 credits). Please recharge your Aelixxr Energy to continue."}
            
            # Deduct 1 credit for the intent to act
            cur.execute("UPDATE users SET energy_credits = energy_credits - 1 WHERE phone = %s", (user_phone,))
            conn.commit()
            
    except Exception as e:
        return {"error": f"Financial Guard error: {str(e)}"}
    finally:
        if conn:
            conn.close()

    return None # Proceed with tool execution

def post_tool_call_handler(ctx: Any, tool_name: str, args: Dict[str, Any], result: str) -> None:
    """
    Optional: Log the action for institutional audit.
    """
    pass
