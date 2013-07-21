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

def extract_comments(reviews, comment_by_key, comments):
    for comment_obj in comments:
        comment_key = comment_obj['key']
        commented_on_key = comment_obj['commentedItem']['key']
        comment_text = comment_obj['comment']

        reviews[commented_on_key].append(comment_key)
        comment_by_key[comment_key] = comment_text


def get_rdio_comments(album_key):
    oauth2_token = {
        'access_token': settings.RDIO_OAUTH2_TOKEN,
        'token_type': 'bearer'
    }
    oauth2_auth = OAuth2(client_id=settings.RDIO_OAUTH2_KEY,
                         token=oauth2_token)

    reviews = defaultdict(list)
    comment_by_key = {}

    start = 0
    count = 50
    response = {}
    response_size = 0
    payload = {
        'method': 'getComments',
        'object': album_key,
        'start': start,
        'count': count,
        'extras': '-commenter',
    }
    source_item = None

    while True:
        if 'result' in response:
            if source_item is None:
                source_item = response['result']['commentedItem']
            extract_comments(reviews, comment_by_key, response['result']['comments'])

        start += response_size
        payload['start'] = start
        r = requests.post(settings.RDIO_OAUTH2_URL, auth=oauth2_auth, data=payload)
        response = r.json()

        response_size = len(response['result']['comments'])
        if response_size <= 0:
            break

    return source_item, reviews, comment_by_key


def start_request(session, comment_key, comment_text):
    """
    Returns a Future
    """
    url = 'http://access.alchemyapi.com/calls/text/TextGetTextSentiment'
    payload = {
        'text': comment_text,
        'outputMode': 'json',
    }

    return comment_key, session.get(url=url, params=payload)


def complete_requests(futures):
    sentiment_by_comment_key = {}
    for comment_key, future in futures:
        # This will block until it finishes
        api_result = future.result()

        payload = api_result.json()
        if payload['status'] == "OK":
            sentiment_type = payload['docSentiment']['type']
            sentiment_by_comment_key[comment_key] = sentiment_type

    return sentiment_by_comment_key


def aggregate_sentiment(reviews, sentiment_by_comment_key):
    total_sentiment = defaultdict(int)
    per_item_sentiment = defaultdict(lambda: defaultdict(int))

    for item_key, comment_keys in reviews.iteritems():
        for comment_key in comment_keys:
            try:
                sentiment_type = sentiment_by_comment_key[comment_key]
            except KeyError:
                continue
            per_item_sentiment[item_key][sentiment_type] += 1
            total_sentiment[sentiment_type] += 1

    return total_sentiment, per_item_sentiment


def home(request, album_key):
    response = cache.get(album_key)

    if response is None:
        session = FuturesSession(max_workers=5)
        session.auth = AlchemyApiAuth(settings.ALCHEMYAPI_KEY)

        futures = []
        source_item, reviews, comment_by_key = get_rdio_comments(album_key)
        for comment_key, comment_text in comment_by_key.iteritems():
            futures.append(start_request(session, comment_key, comment_text))

        sentiment_by_comment_key = complete_requests(futures)
        total_sentiment, per_item_sentiment = aggregate_sentiment(reviews, sentiment_by_comment_key)

        response = {
            'item': source_item,
            'total_sentiment': total_sentiment,
            'per_item_sentiment': per_item_sentiment,
        }

        cache.set(album_key, response)

    return http.HttpResponse(json.dumps(response, indent=2),
                             content_type='application/json')
