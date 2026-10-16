from apps.core.errors import NotFound

from .models import Attachment


def get_attachment(public_id) -> Attachment:
    try:
        return Attachment.objects.get(public_id=public_id)
    except Attachment.DoesNotExist:
        raise NotFound() from None
