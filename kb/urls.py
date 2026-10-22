from django.urls import path
from . import views, api_sources, api_ask, api_questions

urlpatterns = [
    # Page routes
    path('', views.ask_page, name='ask_page'),
    path('sources', views.sources_list_page, name='sources_list_page'),
    path('sources/new', views.source_new_page, name='source_new_page'),
    path('sources/<int:id>', views.source_explorer_page, name='source_explorer_page'),
    path('sources/<int:id>/files/<int:file_id>', views.file_detail_page, name='file_detail_page'),
    path('questions', views.questions_list_page, name='questions_list_page'),
    path('questions/<int:id>', views.question_detail_page, name='question_detail_page'),

    # API routes
    path('api/sources', api_sources.api_sources_list, name='api_sources_list'),
    path('api/sources/text', api_sources.api_sources_text, name='api_sources_text'),
    path('api/sources/upload', api_sources.api_sources_upload, name='api_sources_upload'),
    path('api/sources/github', api_sources.api_sources_github, name='api_sources_github'),
    path('api/sources/<int:id>', api_sources.api_source_detail, name='api_source_detail'),
    path('api/sources/<int:id>/files/<int:file_id>', api_sources.api_source_file_detail, name='api_source_file_detail'),
    path('api/ask', api_ask.api_ask, name='api_ask'),
    path('api/questions', api_questions.api_questions_list, name='api_questions_list'),
    path('api/questions/<int:id>', api_questions.api_question_detail, name='api_question_detail'),
]
