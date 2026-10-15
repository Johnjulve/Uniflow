"""
Domain exceptions for the inventory engine.
"""


class InventoryError(Exception):
    """Base exception for inventory engine failures."""
    pass


class InsufficientStockError(InventoryError):
    """Raised when an operation would drop stock below zero and negative stock is disallowed."""
    pass


class InvalidMovementError(InventoryError):
    """Raised when invalid parameters or zero-quantity delta is supplied."""
    pass
