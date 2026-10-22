import os
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.conf import settings
from kb.models import Source, SourceFile, Chunk, SourceKind, SourceStatus, SourceFileKind, SourceFileStatus
from kb.rag.retrieval import embed_chunks

DEMO_TEXT = """# Python Requests Library Quickstart

## Making a GET Request
Making a request with Requests is very simple. Begin by importing the Requests module:
```python
import requests
r = requests.get('https://api.github.com/events')
```
Now, we have a Response object called `r`. We can get all the information we need from this object.

## Passing Parameters In URLs
You often want to send some sort of data in the URL's query string. If you were constructing the URL by hand, this data would be given as key/value pairs in the URL after a question mark, e.g. `httpbin.org/get?key=val`. Requests allows you to provide these arguments as a dictionary of strings, using the `params` keyword argument:
```python
payload = {'key1': 'value1', 'key2': 'value2'}
r = requests.get('https://httpbin.org/get', params=payload)
print(r.url) # https://httpbin.org/get?key1=value1&key2=value2
```

## Response Content and JSON
We can read the content of the server's response. Consider the GitHub timeline again:
```python
import requests
r = requests.get('https://api.github.com/events')
r.text # Decoded UTF-8 string
r.content # Raw bytes
r.json() # Built-in JSON decoder
```
In case the JSON decoding fails, `r.json()` raises `requests.exceptions.JSONDecodeError` in requests 2.27+.

## Timeouts and Errors
You can tell Requests to stop waiting for a response after a given number of seconds with the `timeout` parameter. Nearly all production code should use this parameter in nearly all requests. Failure to do so can cause your program to hang indefinitely:
```python
requests.get('https://github.com', timeout=5.0)
```
If the request times out, a `Timeout` exception is raised. In the event of a network problem (e.g. DNS failure, refused connection, etc), Requests will raise a `ConnectionError` exception. In the event of the rare invalid HTTP response, Requests will raise an `HTTPError` exception.
"""

class Command(BaseCommand):
    help = "Seed the database with a demo user and a demo TEXT source with real embeddings"

    def handle(self, *args, **options):
        seed_pw = getattr(settings, 'SEED_PASSWORD', None) or os.environ.get('SEED_PASSWORD', 'change-me-too')
        email = 'demo@example.com'

        self.stdout.write(f"Seeding demo user: {email}...")
        user, created = User.objects.get_or_create(username=email, defaults={'email': email})
        user.set_password(seed_pw)
        user.email = email
        user.save()
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created demo user: {email}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Updated demo user password: {email}"))

        # Clean up existing demo sources for idempotent seeding
        Source.objects.filter(owner=user, name='Python Requests Documentation').delete()

        self.stdout.write("Creating demo source...")
        source = Source.objects.create(
            owner=user,
            name='Python Requests Documentation',
            kind=SourceKind.TEXT,
            status=SourceStatus.READY,
            file_count=1,
            chunk_count=0,
        )

        source_file = SourceFile.objects.create(
            source=source,
            path='requests_quickstart.md',
            kind=SourceFileKind.DOCUMENT,
            language='markdown',
            topic='Python Requests Library Quickstart',
            extracted_text=DEMO_TEXT.strip(),
            size_bytes=len(DEMO_TEXT.encode('utf-8')),
            status=SourceFileStatus.READY,
            chunk_count=0,
        )

        # Split demo text into sections/chunks
        sections = DEMO_TEXT.strip().split("\n\n## ")
        chunk_texts = []
        for i, sec in enumerate(sections):
            prefix = "" if i == 0 else "## "
            chunk_texts.append((prefix + sec).strip())

        self.stdout.write(f"Generating local embeddings for {len(chunk_texts)} chunks...")
        embeddings = embed_chunks(chunk_texts)

        for pos, (text, emb) in enumerate(zip(chunk_texts, embeddings)):
            Chunk.objects.create(
                source=source,
                source_file=source_file,
                position=pos,
                text=text,
                embedding=emb,
            )

        source.chunk_count = len(chunk_texts)
        source.save()
        source_file.chunk_count = len(chunk_texts)
        source_file.save()

        self.stdout.write(self.style.SUCCESS(
            f"Successfully seeded database with demo user '{email}' and source '{source.name}' ({len(chunk_texts)} chunks with real embeddings)."
        ))
