# ![mailing-list-filter](dev/icon.png) mailing-list-filter

Thunderbird mail filter search term using mailing lists (and not whole addressbooks).

This addon was created because Thunderbird only allows filtering mail by whole Addressbooks, and not by mailing lists ([bug 180013](https://bugzilla.mozilla.org/show_bug.cgi?id=180013)).

## Usage

The addon creates new search terms `Author from mailing list` and `Recipients from mailing list`; these search terms only allow operators `is in AB`/`is not in AB`, and the dropdown on the right contains address books and mailing lists, too... Et voila, mailing-list-based filtering works!

## Compatibility Table

Please note that this addon is best support for the ESR release of Thunderbird (i.e. the slower, once-a-year updated version). If you're on Release channel, the addon may break with any update.

| Addon Version | Thunderbird Versions |
|---------------|----------------------|
| 5.1+          | 136+                 |
| 5.*           | \>= 128              |
| 4.*           | 102 - 115            |
| 3.*           | 78 - 101             |
| 2.*           | 68 - 77              |
| 1.*           | < 67                 |