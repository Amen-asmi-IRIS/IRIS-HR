"""A stand-in for the employee directory that the organisation app provides from plan 02."""

from apps.accounts.ports import EmployeeRef


class StubDirectory:
    def __init__(self) -> None:
        self.refs: dict[str, EmployeeRef] = {}  # employees without an account, by public id
        self.linked: dict[int, EmployeeRef] = {}  # user id -> employee
        self.left: set[int] = set()  # user ids whose employee has left the company

    def add(self, public_id: str, full_name: str, email: str) -> EmployeeRef:
        ref = EmployeeRef(public_id, full_name, email)
        self.refs[public_id] = ref
        return ref

    def candidate(self, public_id: str) -> EmployeeRef | None:
        return self.refs.get(public_id)

    def candidates(self) -> list[EmployeeRef]:
        return list(self.refs.values())

    def link(self, *, user_id: int, public_id: str) -> None:
        self.linked[user_id] = self.refs.pop(public_id)

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        return self.linked.get(user_id)

    def has_left(self, user_id: int) -> bool:
        return user_id in self.left

    def name_on_account(self):
        return None
