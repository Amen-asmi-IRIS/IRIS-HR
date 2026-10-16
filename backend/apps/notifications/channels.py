"""Delivery channels (NOT-05). Today there is one; an email channel is added to CHANNELS, and nothing else changes."""

from collections.abc import Sequence
from typing import Protocol


class Channel(Protocol):
    def deliver(self, notifications: Sequence) -> None:
        """Called once per notify() with the notifications that were just stored."""


class InAppChannel:
    """The stored row is the in-app delivery: the list and the unread count read it."""

    def deliver(self, notifications: Sequence) -> None:
        return None


CHANNELS: list[Channel] = [InAppChannel()]
