from django.db import models
from django.contrib.auth.models import User
from pgvector.django import VectorField, HnswIndex

class SourceKind(models.TextChoices):
    TEXT = 'TEXT', 'Pasted Text'
    FILE = 'FILE', 'Uploaded File'
    GITHUB = 'GITHUB', 'GitHub Repository'

class SourceStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    PROCESSING = 'PROCESSING', 'Processing'
    READY = 'READY', 'Ready'
    FAILED = 'FAILED', 'Failed'

class SourceFileKind(models.TextChoices):
    DOCUMENT = 'DOCUMENT', 'Document'
    CODE = 'CODE', 'Code'

class SourceFileStatus(models.TextChoices):
    READY = 'READY', 'Ready'
    SKIPPED = 'SKIPPED', 'Skipped'
    FAILED = 'FAILED', 'Failed'

class EvidenceStatus(models.TextChoices):
    SUFFICIENT = 'SUFFICIENT', 'Sufficient Evidence'
    INSUFFICIENT = 'INSUFFICIENT', 'Insufficient Evidence'
    NO_SOURCES = 'NO_SOURCES', 'No Sources Searched'


class Source(models.Model):
    id = models.BigAutoField(primary_key=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sources')
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, choices=SourceKind.choices)
    origin_url = models.CharField(max_length=500, null=True, blank=True)
    status = models.CharField(
        max_length=15,
        choices=SourceStatus.choices,
        default=SourceStatus.PENDING,
    )
    error_message = models.TextField(null=True, blank=True)
    file_count = models.IntegerField(default=0)
    chunk_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.kind} - {self.status})"


class SourceFile(models.Model):
    id = models.BigAutoField(primary_key=True)
    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name='files')
    path = models.CharField(max_length=500)
    kind = models.CharField(max_length=10, choices=SourceFileKind.choices)
    language = models.CharField(max_length=50, null=True, blank=True)
    topic = models.CharField(max_length=255, null=True, blank=True)
    page_count = models.IntegerField(null=True, blank=True)
    extracted_text = models.TextField(null=True, blank=True)
    size_bytes = models.IntegerField()
    status = models.CharField(max_length=10, choices=SourceFileStatus.choices)
    skip_reason = models.CharField(max_length=255, null=True, blank=True)
    chunk_count = models.IntegerField(default=0)

    class Meta:
        ordering = ['path']

    def __str__(self):
        return f"{self.path} ({self.source.name})"


class Chunk(models.Model):
    id = models.BigAutoField(primary_key=True)
    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name='chunks')
    source_file = models.ForeignKey(SourceFile, on_delete=models.CASCADE, related_name='chunks')
    position = models.IntegerField()
    text = models.TextField()
    page_number = models.IntegerField(null=True, blank=True)
    start_line = models.IntegerField(null=True, blank=True)
    end_line = models.IntegerField(null=True, blank=True)
    embedding = VectorField(dimensions=384)

    class Meta:
        indexes = [
            HnswIndex(
                name='chunk_embedding_hnsw_idx',
                fields=['embedding'],
                opclasses=['vector_cosine_ops'],
            )
        ]
        ordering = ['source_file', 'position']

    def __str__(self):
        return f"Chunk {self.position} for {self.source_file.path}"


class Question(models.Model):
    id = models.BigAutoField(primary_key=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='questions')
    code = models.TextField(blank=True, max_length=20000)
    language = models.CharField(max_length=50, null=True, blank=True)
    question_text = models.TextField(blank=True, max_length=2000)
    source_ids = models.JSONField(default=list)
    answer = models.JSONField(null=True, blank=True)
    evidence_status = models.CharField(max_length=15, choices=EvidenceStatus.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        q_preview = (self.question_text[:40] + '...') if len(self.question_text) > 40 else self.question_text
        return f"Q#{self.id}: {q_preview or 'No question text'}"


class RetrievedChunk(models.Model):
    id = models.BigAutoField(primary_key=True)
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='retrieved_chunks')
    chunk = models.ForeignKey(Chunk, on_delete=models.SET_NULL, null=True, blank=True, related_name='retrievals')
    rank = models.IntegerField()
    score = models.FloatField()
    saved_label = models.TextField()
    saved_text = models.TextField()
    cited = models.BooleanField(default=False)

    class Meta:
        ordering = ['rank']

    def __str__(self):
        return f"Rank #{self.rank} for Question #{self.question_id} (score {self.score:.4f})"
