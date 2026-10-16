import base64

import pytest

from config.env import EnvError, load

FERNET_KEY = base64.urlsafe_b64encode(b"0" * 32).decode()

VALID = {
    "ENVIRONMENT": "development",
    "APP_VERSION": "v1.2.3",
    "SITE_HOSTNAME": "hr.iris.local",
    "DJANGO_SECRET_KEY": "s" * 64,
    "DJANGO_ALLOWED_HOSTS": "hr.iris.local, localhost",
    "POSTGRES_DB": "iris_hr",
    "POSTGRES_USER": "iris_hr",
    "POSTGRES_PASSWORD": "p" * 24,
    "FILE_ENCRYPTION_KEY": FERNET_KEY,
    "BACKUP_PASSPHRASE": "b" * 24,
    "ALLOWED_EMAIL_DOMAIN": "ImpactRisks.com",
    "TIME_ZONE": "Africa/Tunis",
    "DEFAULT_LANGUAGE": "fr",
    "LOG_LEVEL": "info",
}


def env_with(**changes):
    values = dict(VALID)
    values.update(changes)
    return values


def test_a_valid_environment_loads():
    env = load(VALID)

    assert env.environment == "development"
    assert env.app_version == "v1.2.3"
    assert env.site_hostname == "hr.iris.local"
    assert env.allowed_hosts == ("hr.iris.local", "localhost")
    assert env.allowed_email_domain == "impactrisks.com"
    assert env.time_zone == "Africa/Tunis"
    assert env.default_language == "fr"
    assert env.log_level == "INFO"
    assert env.file_encryption_key == FERNET_KEY


@pytest.mark.parametrize("name", sorted(VALID))
def test_a_missing_variable_is_named(name):
    values = dict(VALID)
    del values[name]

    with pytest.raises(EnvError) as error:
        load(values)

    assert error.value.variable == name
    assert name in str(error.value)


@pytest.mark.parametrize("name", sorted(VALID))
def test_a_blank_variable_is_named(name):
    with pytest.raises(EnvError) as error:
        load(env_with(**{name: "   "}))

    assert error.value.variable == name


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("ENVIRONMENT", "staging"),
        ("DEFAULT_LANGUAGE", "de"),
        ("LOG_LEVEL", "LOUD"),
        ("TIME_ZONE", "Africa/Atlantis"),
        ("FILE_ENCRYPTION_KEY", "not-a-fernet-key"),
        ("FILE_ENCRYPTION_KEY", base64.urlsafe_b64encode(b"0" * 16).decode()),
        ("ALLOWED_EMAIL_DOMAIN", "@impactrisks.com"),
        ("ALLOWED_EMAIL_DOMAIN", "impactrisks"),
        ("DJANGO_SECRET_KEY", "too-short"),
        ("DJANGO_SECRET_KEY", "change-me" + "x" * 60),
        ("POSTGRES_PASSWORD", "change-me"),
        ("POSTGRES_PASSWORD", "short"),
        ("BACKUP_PASSPHRASE", "change-me-please-now"),
        ("BACKUP_PASSPHRASE", "tooshort"),
        ("DJANGO_ALLOWED_HOSTS", " , "),
        ("DJANGO_ALLOWED_HOSTS", "good.host, bad host"),
        ("SITE_HOSTNAME", "https://hr.iris.local"),
    ],
)
def test_a_malformed_variable_is_named(name, value):
    with pytest.raises(EnvError) as error:
        load(env_with(**{name: value}))

    assert error.value.variable == name


def test_the_process_environment_is_the_default_source(monkeypatch):
    for name, value in VALID.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("APP_VERSION", "from-os-environ")

    assert load().app_version == "from-os-environ"
