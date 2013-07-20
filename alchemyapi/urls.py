from django.conf.urls import patterns, include, url

urlpatterns = patterns('',
    url(r'^album/(?P<album_key>a\d+)/$', 'alchemyapi.views.home', name='home'),
)
