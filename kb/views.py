from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from .models import Source, SourceFile, Question

@login_required
def ask_page(request):
    """Render the Ask home page."""
    return render(request, 'ask/ask.html')

@login_required
def sources_list_page(request):
    """Render the Sources management page."""
    return render(request, 'sources/list.html')

@login_required
def source_new_page(request):
    """Render the Add Source page."""
    return render(request, 'sources/new.html')

@login_required
def source_explorer_page(request, id):
    """Render the Source Explorer page."""
    source = get_object_or_404(Source, id=id)
    if source.owner != request.user:
        return render(request, '403.html', status=403)
    return render(request, 'sources/explorer.html', {'source_id': id})

@login_required
def file_detail_page(request, id, file_id):
    """Render the File Detail page."""
    source = get_object_or_404(Source, id=id)
    if source.owner != request.user:
        return render(request, '403.html', status=403)
    file_obj = get_object_or_404(SourceFile, id=file_id, source=source)
    return render(request, 'sources/file_detail.html', {'source_id': id, 'file_id': file_id})

@login_required
def questions_list_page(request):
    """Render the Questions History page."""
    return render(request, 'questions/list.html')

@login_required
def question_detail_page(request, id):
    """Render the Question Answer page."""
    question = get_object_or_404(Question, id=id)
    if question.owner != request.user:
        return render(request, '403.html', status=403)
    return render(request, 'questions/detail.html', {'question_id': id})
