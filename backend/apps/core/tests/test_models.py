from apps.core.models import PublicIdModel, TimeStampedModel


def test_both_bases_are_abstract():
    assert PublicIdModel._meta.abstract is True
    assert TimeStampedModel._meta.abstract is True


def test_the_public_id_is_random_unique_and_not_editable():
    field = PublicIdModel._meta.get_field("public_id")

    assert field.unique is True
    assert field.editable is False
    assert field.default() != field.default()


def test_timestamps_are_set_by_the_database_layer():
    assert TimeStampedModel._meta.get_field("created_at").auto_now_add is True
    assert TimeStampedModel._meta.get_field("updated_at").auto_now is True
