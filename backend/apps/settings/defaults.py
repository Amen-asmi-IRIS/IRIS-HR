"""The system settings (ADM-06). HR settings are registered by the apps that use them, from plan 03a on."""

from apps.settings.registry import SettingDef, register

SYSTEM_SETTINGS = [
    SettingDef("session_timeout_minutes", "system", "int", 120, 5, 1440),
    SettingDef("lockout_threshold", "system", "int", 5, 3, 20),
    SettingDef("lockout_minutes", "system", "int", 15, 1, 1440),
    SettingDef("login_ip_max_attempts", "system", "int", 20, 5, 1000),
    SettingDef("temp_password_hours", "system", "int", 24, 1, 168),
    SettingDef("upload_max_mb", "system", "int", 10, 1, 50),
    SettingDef(
        "upload_allowed_types", "system", "str_list", ["pdf", "jpg", "png"], choices=("pdf", "jpg", "png")
    ),
]


def register_system_settings() -> None:
    for definition in SYSTEM_SETTINGS:
        register(definition)
