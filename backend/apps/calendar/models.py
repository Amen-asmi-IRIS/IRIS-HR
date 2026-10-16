from django.db import models


class PublicHoliday(models.Model):
    date = models.DateField(unique=True)
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    recurs_yearly = models.BooleanField(default=False)

    class Meta:
        ordering = ["date"]

    def __str__(self) -> str:
        return f"{self.date:%Y-%m-%d} {self.name_en}"
