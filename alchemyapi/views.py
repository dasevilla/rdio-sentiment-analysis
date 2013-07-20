from collections import defaultdict
from pprint import pprint

from django import http
from django.conf import settings
from django.core.cache import cache
from django.utils import simplejson as json
from requests.auth import AuthBase
from requests_futures.sessions import FuturesSession
from requests_oauthlib import OAuth2, OAuth2Session
import requests


class AlchemyApiAuth(AuthBase):
    """Attaches HTTP Pizza Authentication to the given Request object."""
    def __init__(self, alchemyapi_key):
        self.alchemyapi_key = alchemyapi_key

    def __call__(self, r):
        payload = {
            'apikey': self.alchemyapi_key,
        }
        r.prepare_url(url=r.url, params=payload)

        return r


def get_rdio_comments(album_key):
    oauth2_token = {
        'access_token': settings.RDIO_OAUTH2_TOKEN,
        'token_type': 'bearer'
    }
    oauth2_auth = OAuth2(client_id=settings.RDIO_OAUTH2_KEY,
                         token=oauth2_token)

    start = 0
    count = 50
    response = {}
    response_size = 0
    payload = {
        'method': 'getComments',
        'object': album_key,
        'start': start,
        'count': count,
        'extras': '-commentedItem,-commenter',
    }
    source_item = None

    storage = []
    while True:
        if 'result' in response:
            if source_item is None:
                source_item = response['result']['commentedItem']
            comments = map(lambda x: x['comment'], response['result']['comments'])
            storage.extend(comments)

        start += response_size
        payload['start'] = start
        r = requests.post(settings.RDIO_OAUTH2_URL, auth=oauth2_auth, data=payload)
        response = r.json()

        response_size = len(response['result']['comments'])
        if response_size <= 0:
            break

    return source_item, storage


def start_request(session, comment_text):
    """
    Returns a Future
    """
    url = 'http://access.alchemyapi.com/calls/text/TextGetTextSentiment'
    payload = {
        'text': comment_text,
        'outputMode': 'json',
    }

    return session.get(url=url, params=payload)


def count_sentiment(futures):
    sentiment_counter = defaultdict(int)
    for future in futures:
        # This will block until it finishes
        api_result = future.result()

        payload = api_result.json()
        if payload['status'] == "OK":
            sentiment_type = payload['docSentiment']['type']
            sentiment_counter[sentiment_type] += 1
        else:
            error_code = payload['statusInfo']
            if error_code == 'unsupported-text-language':
                # print 'Unsupported language:', payload['language']
                pass

    return sentiment_counter


def home(request, album_key):
    response = cache.get(album_key)

    if response is None:
        session = FuturesSession(max_workers=5)
        session.auth = AlchemyApiAuth(settings.ALCHEMYAPI_KEY)

        futures = []
        rdio_album, comments = get_rdio_comments(album_key)
        for comment_text in comments:
            futures.append(start_request(session, comment_text))

        response = {
            'item': rdio_album,
            'sentiment': count_sentiment(futures),
        }

        cache.set(album_key, response)

    return http.HttpResponse(json.dumps(response, indent=2),
                             content_type='application/json')
