from django.urls import path
from . import views

urlpatterns = [
    path('register', views.register_view, name='register_page'),
    path('login', views.login_view, name='login_page'),
    path('api/auth/register', views.api_register, name='api_register'),
    path('api/auth/login', views.api_login, name='api_login'),
    path('api/auth/logout', views.api_logout, name='api_logout'),
]
