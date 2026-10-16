import pytest

from apps.accounts import services as account_services
from apps.core.models import JobStatus
from apps.notifications.models import Notification
from apps.requests import selectors, services, tasks
from apps.requests.models import RequestStep
from apps.requests.services import StepSpec
from apps.requests.tests.helpers import MON, NOW, TODAY, at, days, decide, pdf, pending_step, submitted
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def count(event: str, user=None) -> int:
    found = Notification.objects.filter(event_code=event)
    return found.filter(user=user).count() if user is not None else found.count()


def sick(world, **options):
    return submitted(world, request_type=world.sick, data=days(TODAY), **options)


# ------------------------------------------------------------------ reminders and flags (REQ-13)


def test_a_reminder_goes_out_after_two_working_days_and_only_once(world):
    request = submitted(world)  # Tuesday 6 October, 09:00
    assert services.send_reminders_and_flags(now=at(10, 8, 8, 59)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 8, 9, 0)) == {"reminded": 1, "flagged": 0}
    assert count("step.reminder", world.manager_user) == 1
    assert pending_step(request).reminded_at == at(10, 8, 9, 0)
    assert services.send_reminders_and_flags(now=at(10, 8, 10, 0)) == {"reminded": 0, "flagged": 0}
    assert count("step.reminder") == 1


def test_the_weekend_does_not_count(world, clock):
    clock.move_to(at(10, 9, 16, 0))  # Friday afternoon
    submitted(world)
    assert services.send_reminders_and_flags(now=at(10, 12, 15, 59)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 13, 16, 0)) == {"reminded": 1, "flagged": 0}


def test_a_manager_step_is_flagged_to_hr_after_four_working_days_and_only_once(world):
    request = submitted(world)
    services.send_reminders_and_flags(now=at(10, 8, 9, 0))
    assert services.send_reminders_and_flags(now=at(10, 9, 17, 0)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 12, 9, 0)) == {"reminded": 0, "flagged": 1}
    assert count("step.flagged", world.hr_user) == 1
    assert pending_step(request).flagged_at == at(10, 12, 9, 0)
    assert [step.request_id for step in selectors.queue(world.hr_user, "stuck")] == [request.pk]
    assert services.send_reminders_and_flags(now=at(10, 13, 9, 0)) == {"reminded": 0, "flagged": 0}
    assert count("step.flagged") == 1


def test_a_step_nobody_can_decide_any_more_is_flagged_at_the_next_run(world):
    """Master D13: the account of the manager was switched off while the step was waiting."""
    request = submitted(world)
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    assert services.send_reminders_and_flags(now=at(10, 6, 10, 0)) == {"reminded": 0, "flagged": 1}
    assert pending_step(request).flagged_at == at(10, 6, 10, 0)
    assert count("step.flagged", world.hr_user) == 1
    assert [step.request_id for step in selectors.queue(world.hr_user, "stuck")] == [request.pk]
    assert services.send_reminders_and_flags(now=at(10, 6, 11, 0)) == {"reminded": 0, "flagged": 0}
    assert count("step.flagged") == 1


def test_an_hr_step_is_reminded_but_never_flagged(world):
    request = submitted(world)
    decide(request, world.manager_user)
    assert services.send_reminders_and_flags(now=at(10, 20, 9, 0)) == {"reminded": 1, "flagged": 0}
    assert count("step.reminder", world.hr_user) == 1
    assert pending_step(request).flagged_at is None


def test_the_delays_are_those_the_request_was_sent_with(world):
    submitted(world, request_type=world.remote, data=days(MON))
    services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[
            StepSpec(approver_rule="line_manager", reminder_after_days=1, flag_after_days=1),
            StepSpec(approver_rule="hr_role"),
        ],
    )
    assert services.send_reminders_and_flags(now=at(10, 7, 9, 0)) == {"reminded": 0, "flagged": 0}


def test_a_step_given_to_someone_else_starts_its_delays_again(world, clock):
    request = submitted(world)
    services.send_reminders_and_flags(now=at(10, 12, 9, 0))  # reminded and flagged
    clock.move_to(at(10, 12, 10, 0))
    services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason="Absence"
    )
    assert services.send_reminders_and_flags(now=at(10, 13, 10, 0)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 14, 10, 0)) == {"reminded": 1, "flagged": 0}
    assert count("step.reminder", world.other_manager_user) == 1


def test_closed_requests_are_left_alone(world):
    request = submitted(world)
    services.withdraw(actor=world.owner_user, request=request)
    assert services.send_reminders_and_flags(now=at(10, 20, 9, 0)) == {"reminded": 0, "flagged": 0}
    assert RequestStep.objects.filter(reminded_at__isnull=False).count() == 0


# ------------------------------------------------------------------ certificate deadlines (PRD 6.5)


def test_the_employee_is_warned_twelve_hours_before_the_deadline_and_only_once(world):
    request = sick(world)  # due on Thursday 8 October, 09:00
    assert services.check_certificate_deadlines(now=at(10, 7, 20, 59)) == {"due_soon": 0, "overdue": 0}
    assert services.check_certificate_deadlines(now=at(10, 7, 21, 0)) == {"due_soon": 1, "overdue": 0}
    warning = Notification.objects.get(event_code="certificate.due_soon")
    assert (warning.user, warning.target_public_id) == (world.owner_user, str(request.public_id))
    assert warning.parameters["due"] == "08/10/2026 09:00"
    assert services.check_certificate_deadlines(now=at(10, 7, 22, 0)) == {"due_soon": 0, "overdue": 0}
    assert count("certificate.due_soon") == 1


def test_hr_is_told_at_the_deadline_and_only_once(world):
    sick(world)
    assert services.check_certificate_deadlines(now=at(10, 8, 9, 0)) == {"due_soon": 0, "overdue": 1}
    assert count("certificate.overdue", world.hr_user) == 1
    assert services.check_certificate_deadlines(now=at(10, 9, 9, 0)) == {"due_soon": 0, "overdue": 0}
    assert count("certificate.overdue") == 1
    assert count("certificate.due_soon") == 0  # the warning is not sent after the fact


def test_a_certificate_or_a_decision_ends_the_follow_up(world):
    with_certificate = sick(world)
    services.attach_file(actor=world.owner_user, request=with_certificate, upload=pdf())
    decided = sick(world, employee=world.peer)
    decide(decided, world.hr_user)
    assert services.check_certificate_deadlines(now=at(10, 9, 9, 0)) == {"due_soon": 0, "overdue": 0}
    assert count("certificate.overdue") == 0


def test_the_warning_delay_is_an_hr_setting(world):
    sick(world)
    settings_service.set_value(actor=world.hr_user, key="certificate_warning_hours", value=24)
    assert services.check_certificate_deadlines(now=at(10, 7, 9, 0)) == {"due_soon": 1, "overdue": 0}


# ------------------------------------------------------------------ the tasks


def test_the_tasks_record_their_runs(world):
    submitted(world)
    assert tasks.reminders_and_flags(0) == {"reminded": 0, "flagged": 0}
    assert tasks.certificate_deadlines(0) == {"due_soon": 0, "overdue": 0}
    for name in ("requests.reminders_and_flags", "requests.certificate_deadlines"):
        status = JobStatus.objects.get(name=name)
        assert status.last_ok is True
        assert status.last_finished_at == NOW
