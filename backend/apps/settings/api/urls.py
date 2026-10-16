from django.urls import path

from apps.settings.api import views

app_name = "settings"

urlpatterns = [
    path("settings/hr", views.HrSettingsView.as_view(), name="hr"),
    path("settings/hr/<str:key>", views.HrSettingItemView.as_view(), name="hr-item"),
    path("settings/system", views.SystemSettingsView.as_view(), name="system"),
    path("settings/system/<str:key>", views.SystemSettingItemView.as_view(), name="system-item"),
]
