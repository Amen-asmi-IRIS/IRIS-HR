from apps.accounts.ports import employee_directory


def display_name(user) -> str:
    """The name shown for an account: the employee's name if linked, else the stored name, else the email."""
    ref = employee_directory().ref_for_user(user.pk)
    if ref is not None:
        return ref.full_name
    return user.full_name or user.email
