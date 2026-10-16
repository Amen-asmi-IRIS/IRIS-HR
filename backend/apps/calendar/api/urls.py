from django.urls import path

from . import views
from .feed_views import CalendarFeedView

app_name = "calendar"

urlpatterns = [
    path("holidays", views.HolidayListView.as_view(), name="holiday-list"),
    path("holidays/copy", views.HolidayCopyView.as_view(), name="holiday-copy"),
    path("holidays/impact", views.HolidayImpactView.as_view(), name="holiday-impact"),
    path("holidays/<int:pk>", views.HolidayDetailView.as_view(), name="holiday-detail"),
    path("calendar", CalendarFeedView.as_view(), name="feed"),
]
