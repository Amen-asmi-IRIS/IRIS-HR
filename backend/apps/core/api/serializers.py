from rest_framework import serializers


class HealthOut(serializers.Serializer):
    status = serializers.CharField()
    app = serializers.CharField()
    database = serializers.CharField()
    worker = serializers.CharField()
    version = serializers.CharField()
    environment = serializers.CharField()


class AccountBriefOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.CharField()


class AccountsAttentionOut(serializers.Serializer):
    locked = AccountBriefOut(many=True)
    awaiting_first_sign_in = AccountBriefOut(many=True)
    temp_expired = AccountBriefOut(many=True)
    employees_without_account = AccountBriefOut(many=True)


class JobOut(serializers.Serializer):
    name = serializers.CharField()
    schedule = serializers.CharField(allow_blank=True)
    last_started_at = serializers.DateTimeField(allow_null=True)
    last_finished_at = serializers.DateTimeField(allow_null=True)
    last_ok = serializers.BooleanField(allow_null=True)
    last_detail = serializers.CharField(allow_blank=True)
    next_run_at = serializers.DateTimeField(allow_null=True)


class BackupOut(serializers.Serializer):
    last_at = serializers.DateTimeField()
    size_bytes = serializers.IntegerField(allow_null=True)
    storage_used_bytes = serializers.IntegerField(allow_null=True)


class StatusOut(serializers.Serializer):
    health = HealthOut()
    accounts = AccountsAttentionOut()
    jobs = JobOut(many=True)
    backup = BackupOut(allow_null=True)
