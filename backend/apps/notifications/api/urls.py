from django.urls import path

from apps.notifications.api import views

app_name = "notifications"

urlpatterns = [
    path("notifications", views.NotificationListView.as_view(), name="list"),
    path("notifications/unread-count", views.UnreadCountView.as_view(), name="unread-count"),
    path("notifications/read-all", views.NotificationReadAllView.as_view(), name="read-all"),
    path("notifications/<int:pk>/read", views.NotificationReadView.as_view(), name="read"),
]
