from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0002_usermerchantprofile'),
    ]

    operations = [
        migrations.DeleteModel(
            name='Review',
        ),
    ]
