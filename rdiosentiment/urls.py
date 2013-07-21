from django.conf.urls import patterns, include, url

from django.contrib import admin
admin.autodiscover()

urlpatterns = patterns('',
    url(r'^$', 'rdiosentiment.views.home', name='home'),
    url(r'^alchemyapi/', include('alchemyapi.urls')),
    url(r'^admin/', include(admin.site.urls)),
)
