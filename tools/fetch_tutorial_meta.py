#!/usr/bin/env python3
"""
20FIT tutorial-video metadata fetcher (pilot setup helper).

Given YouTube watch URLs, this resolves the data the tutorial_video model needs
via the YouTube oEmbed endpoint:
    https://www.youtube.com/oembed?url=<youtube_url>&format=json
and prints, per URL: video_id, channel_name (author_name), channel_url (author_url).

This is the SETUP-TIME step: run it on a machine with YouTube access, then paste
the resulting channel_name / channel_url into the `_tutorialVideos` map in
`Workout 20FIT (1).html`. It embodies the pilot's basic error handling — if a
video is invalid / private / not embeddable, the oEmbed call fails and the script
reports it clearly and exits non-zero, so broken data is never stored.

(No periodic/cron validation here by design — that only follows if the pilot is
approved for a wider rollout.)

Usage:
    python3 tools/fetch_tutorial_meta.py <youtube_url> [<youtube_url> ...]
"""
import sys, re, json, urllib.parse, urllib.request, urllib.error

def video_id(url):
    m = re.search(r'(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})', url or '')
    return m.group(1) if m else None

def fetch(url):
    vid = video_id(url)
    if not vid:
        raise ValueError('URL tidak valid — video_id (11 karakter) tidak ditemukan')
    endpoint = 'https://www.youtube.com/oembed?' + urllib.parse.urlencode(
        {'url': url, 'format': 'json'})
    try:
        req = urllib.request.Request(endpoint, headers={'User-Agent': '20fit-tutorial-setup'})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        # 401/403/404 from oEmbed => private / deleted / embedding disabled
        raise RuntimeError('oEmbed gagal (video mungkin private / dihapus / '
                           'tidak embeddable): HTTP %d' % e.code)
    except urllib.error.URLError as e:
        raise RuntimeError('tidak bisa menghubungi YouTube oEmbed: %s' % e.reason)
    return {
        'youtube_url': url,
        'video_id': vid,
        'channel_name': data.get('author_name', ''),
        'channel_url': data.get('author_url', ''),
        'title': data.get('title', ''),
    }

def main():
    urls = sys.argv[1:]
    if not urls:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        print('usage: python3 tools/fetch_tutorial_meta.py <youtube_url> ...', file=sys.stderr)
        sys.exit(2)
    ok, failed = [], []
    for u in urls:
        try:
            m = fetch(u)
            ok.append(m)
            print('OK   %-45s  channel=%r  url=%s' % (m['video_id'], m['channel_name'], m['channel_url']))
        except Exception as e:
            failed.append((u, str(e)))
            print('FAIL %s\n     -> %s' % (u, e), file=sys.stderr)
    print('\n--- paste into _tutorialVideos (only entries that succeeded) ---')
    print(json.dumps({m['title'] or m['video_id']: {
        'youtube_url': m['youtube_url'], 'channel_name': m['channel_name'],
        'channel_url': m['channel_url']} for m in ok}, ensure_ascii=False, indent=2))
    # non-zero exit if any failed, so broken data is not silently accepted
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    main()
