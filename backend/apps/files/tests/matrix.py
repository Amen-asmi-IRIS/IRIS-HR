import uuid

from tests.matrix import SIGNED_IN, Case, only

CASES = [
    Case(
        route="files:download",
        method="GET",
        expect=only(hide=SIGNED_IN),
        kwargs=lambda w: {"public_id": uuid.uuid4()},
        label="an attachment that does not exist",
    ),
]
