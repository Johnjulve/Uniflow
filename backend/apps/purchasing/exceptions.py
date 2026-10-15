"""
Domain exceptions for purchasing and procurement operations.
"""


class PurchasingError(Exception):
    """Base exception for purchasing domain failures."""
    pass


class InvalidOrderStatusError(PurchasingError):
    """Raised when an operation is invalid for the purchase order's current status."""
    pass


class OverReceiptError(PurchasingError):
    """Raised when accepted intake quantity exceeds remaining ordered quantity."""
    pass


class PurchaseOrderValidationError(PurchasingError):
    """Raised when purchase order or delivery receipt inputs fail domain validation."""
    pass
